import { z } from 'zod';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildCombatSnapshot } from './combat.js';

export class LookupError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export const nameSchema = z.string().trim().regex(/^[\p{L}\p{N}]{1,12}$/u, '캐릭터 이름은 한글·영문·숫자 1~12자로 입력해 주세요.');
const value = z.union([z.string().max(2000), z.number().finite()]).nullable().optional();
const options = z.record(z.string(), value).nullable().optional();
const itemSchema = z.object({
  item_name: z.string(), item_equipment_slot: z.string(), item_equipment_part: value,
  item_icon: value, starforce: value, starforce_scroll_flag: value,
  scroll_upgrade: value, scroll_upgradeable_count: value, golden_hammer_flag: value, cuttable_count: value,
  soul_name: value, soul_option: value,
  potential_option_grade: value, additional_potential_option_grade: value,
  potential_option_1: value, potential_option_2: value, potential_option_3: value,
  additional_potential_option_1: value, additional_potential_option_2: value, additional_potential_option_3: value,
  item_total_option: options, item_base_option: options, item_add_option: options,
  item_starforce_option: options, item_etc_option: options, item_exceptional_option: options,
});
const basicSchema = z.object({ date: z.string(), character_name: z.string(), character_class: z.string(), character_level: z.number(), world_name: z.string(), character_image: value });
const equipmentSchema = z.object({ date: z.string(), preset_no: z.number().nullable().optional(), item_equipment: z.array(itemSchema).nullable().transform((items) => items ?? []) });
const statSchema = z.object({ date: z.string(), final_stat: z.array(z.object({ stat_name: z.string(), stat_value: z.string() })).nullable().transform((stats) => stats ?? []) });
const setSchema = z.object({ date: z.string(), set_effect: z.array(z.object({ set_name: z.string(), total_set_count: z.number(), set_effect_info: z.array(z.object({ set_count: z.number(), set_option: z.string() })).nullable().transform((effects) => effects ?? []), set_option_full: z.array(z.object({ set_count: z.number(), set_option: z.string() })).nullable().optional() })).nullable().transform((sets) => sets ?? []) });

export function safeImage(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && (url.hostname === 'nexon.com' || url.hostname.endsWith('.nexon.com')) ? url.href : null;
  } catch { return null; }
}

// One completed KST day keeps the four independent snapshots on the same baseline.
export function snapshotDate(now = Date.now()) {
  const kst = new Date(now + 9 * 3600000);
  kst.setUTCDate(kst.getUTCDate() - (kst.getUTCHours() < 2 ? 2 : 1));
  return kst.toISOString().slice(0, 10);
}

export function normalizeSnapshot(raw, requestedDate, fetchedAt) {
  const parsed = [basicSchema.safeParse(raw.basic), equipmentSchema.safeParse(raw.equipment), statSchema.safeParse(raw.stat), setSchema.safeParse(raw.set)];
  if (parsed.some((result) => !result.success)) throw new LookupError('INCOMPLETE_DATA', '장비 정보가 아직 완전하지 않습니다. 잠시 후 다시 조회해 주세요.');
  const [basic, equipment, stat, set] = parsed.map((result) => result.data);
  if (parsed.some((result) => result.data.date.slice(0, 10) !== requestedDate)) throw new LookupError('INCONSISTENT_DATA', '조회 기준일이 서로 다릅니다. 잠시 후 다시 조회해 주세요.');
  return {
    source: 'nexon', date: requestedDate, fetchedAt, preset: equipment.preset_no ?? null,
    character: { name: basic.character_name, job: basic.character_class, level: basic.character_level, world: basic.world_name, image: safeImage(basic.character_image) },
    items: equipment.item_equipment.map((item) => ({ ...item, item_icon: safeImage(item.item_icon) })),
    stats: stat.final_stat, sets: set.set_effect,
    combat: buildCombatSnapshot(stat.final_stat),
    analysis: { status: 'unverified', message: '직업별 계산과 보스 목표 기준 검증 전입니다.' },
  };
}

export function createNexonService({ apiKey, fetchImpl = fetch, now = Date.now, intervalMs = 250, dailyLimit = 1000, quotaFile, cacheTtl = 15 * 60000, maxCache = 100, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const cache = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  let lastStart = -Infinity;
  let quota;
  async function reserve() {
    const day = new Date(now() + 9 * 3600000).toISOString().slice(0, 10);
    if (!quota) {
      try { quota = quotaFile ? JSON.parse(await readFile(quotaFile, 'utf8')) : { day, count: 0 }; }
      catch (error) {
        if (error.code !== 'ENOENT') throw new LookupError('QUOTA_STORAGE', '조회량 기록을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503);
        quota = { day, count: 0 };
      }
      if (typeof quota.day !== 'string' || !Number.isSafeInteger(quota.count) || quota.count < 0) throw new LookupError('QUOTA_STORAGE', '조회량 기록을 확인할 수 없습니다.', 503);
    }
    if (quota.day !== day) quota = { day, count: 0 };
    if (quota.count >= dailyLimit) throw new LookupError('DAILY_LIMIT', '오늘의 캐릭터 조회 한도에 도달했습니다. 내일 다시 이용해 주세요.', 429);
    quota.count += 1;
    if (quotaFile) {
      try {
        await mkdir(dirname(quotaFile), { recursive: true });
        await writeFile(`${quotaFile}.tmp`, JSON.stringify(quota));
        await rename(`${quotaFile}.tmp`, quotaFile);
      } catch { throw new LookupError('QUOTA_STORAGE', '조회량을 기록할 수 없어 요청을 중단했습니다.', 503); }
    }
  }
  function request(path, params) {
    const job = queue.then(async () => {
      const delay = intervalMs - (now() - lastStart);
      if (delay > 0) await sleep(delay);
      await reserve();
      lastStart = now();
      const url = new URL(`https://open.api.nexon.com/maplestory/v1/${path}`);
      Object.entries(params).forEach(([key, val]) => url.searchParams.set(key, val));
      let response;
      try { response = await fetchImpl(url, { headers: { 'x-nxopen-api-key': apiKey }, signal: AbortSignal.timeout(10000) }); }
      catch { throw new LookupError('UPSTREAM_UNAVAILABLE', '넥슨 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503); }
      let body;
      try { body = await response.json(); } catch { throw new LookupError('INVALID_RESPONSE', '조회 서버의 응답을 읽을 수 없습니다.'); }
      if (!response.ok) {
        const code = body?.error?.name;
        if (response.status === 429) throw new LookupError('UPSTREAM_LIMIT', '조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
        if (['OPENAPI00009', 'OPENAPI00010', 'OPENAPI00011'].includes(code)) throw new LookupError('DATA_UNAVAILABLE', '데이터 준비 또는 점검 중입니다. 잠시 후 다시 시도해 주세요.', 503);
        if (response.status === 403 || code === 'OPENAPI00005') throw new LookupError('SERVICE_CONFIGURATION', '캐릭터 조회 연결 설정을 확인 중입니다.', 503);
        if (path === 'id' && response.status === 400 && ['OPENAPI00003', 'OPENAPI00004'].includes(code)) throw new LookupError('CHARACTER_NOT_FOUND', '캐릭터를 찾지 못했습니다. 이름을 확인해 주세요.', 404);
        throw new LookupError('UPSTREAM_ERROR', '캐릭터 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return body;
    });
    queue = job.catch(() => {});
    return job;
  }
  async function lookup(input) {
    const valid = nameSchema.safeParse(input);
    if (!valid.success) throw new LookupError('INVALID_NAME', '캐릭터 이름은 한글·영문·숫자 1~12자로 입력해 주세요.', 400);
    if (!apiKey) throw new LookupError('NOT_CONFIGURED', '실제 캐릭터 조회 연결이 준비되지 않았습니다. 예시 캐릭터를 먼저 확인할 수 있습니다.', 503);
    const name = valid.data;
    const date = snapshotDate(now());
    const key = `${date}:${name}`;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return { ...hit.data, cached: true };
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 8) throw new LookupError('BUSY', '현재 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    const job = (async () => {
      const identity = await request('id', { character_name: name });
      if (typeof identity?.ocid !== 'string' || !identity.ocid) throw new LookupError('INCOMPLETE_DATA', '캐릭터 식별 정보를 확인할 수 없습니다.');
      const params = { ocid: identity.ocid, date };
      const basic = await request('character/basic', params);
      const equipment = await request('character/item-equipment', params);
      const stat = await request('character/stat', params);
      const set = await request('character/set-effect', params);
      const data = normalizeSnapshot({ basic, equipment, stat, set }, date, new Date(now()).toISOString());
      for (const [oldKey, entry] of cache) if (entry.expires <= now()) cache.delete(oldKey);
      if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + cacheTtl });
      return { ...data, cached: false };
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  return { lookup, configured: Boolean(apiKey) };
}
