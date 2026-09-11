import { z } from 'zod';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const usageSchema = z.object({
  itemName: z.string().min(1).max(200),
  count: z.number().int().positive(),
  slotItemShare: z.number().min(0).max(1),
});
const profileSchema = z.object({
  sampleSize: z.number().int().nonnegative(),
  slots: z.record(z.string(), z.array(usageSchema)),
});
const observationSchema = z.object({
  job: z.string().trim().min(1),
  items: z.array(z.object({
    item_equipment_slot: z.string().trim().min(1),
    item_name: z.string().trim().min(1),
  })).min(1),
});

export const equipmentBaselinesSchema = z.object({
  version: z.string().min(1),
  source: z.object({
    kind: z.literal('nexon-open-api-dojang'),
    url: z.url(),
  }),
  date: z.string().date(),
  fetchedAt: z.iso.datetime(),
  sample: z.object({
    requested: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }).refine(({ requested, succeeded, failed }) => requested === succeeded + failed, '표본 집계 수가 일치하지 않습니다.'),
  global: profileSchema,
  jobs: z.record(z.string(), profileSchema),
});

function normalizeSlot(slot) {
  return String(slot).replace(/\d+$/, '');
}

function buildProfile(samples) {
  const countsBySlot = new Map();
  for (const sample of samples) {
    for (const item of sample.items) {
      const slot = normalizeSlot(item.item_equipment_slot);
      if (!slot || !item.item_name) continue;
      const counts = countsBySlot.get(slot) ?? new Map();
      counts.set(item.item_name, (counts.get(item.item_name) ?? 0) + 1);
      countsBySlot.set(slot, counts);
    }
  }
  const slots = {};
  for (const [slot, counts] of [...countsBySlot].sort(([left], [right]) => left.localeCompare(right, 'ko'))) {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    slots[slot] = [...counts].map(([itemName, count]) => ({ itemName, count, slotItemShare: count / total }))
      .sort((left, right) => right.count - left.count || left.itemName.localeCompare(right.itemName, 'ko'));
  }
  return { sampleSize: samples.length, slots };
}

export function assertObservationQuality({ requested, succeeded }, { minimumSamples = 10, minimumSuccessRate = 0.8 } = {}) {
  if (succeeded < minimumSamples || requested === 0 || succeeded / requested < minimumSuccessRate) {
    throw new Error(`공식 무릉 장비 표본이 부족합니다. 성공 ${succeeded}/${requested}, 최소 ${minimumSamples}명·${Math.round(minimumSuccessRate * 100)}%가 필요합니다.`);
  }
}

export function buildEquipmentBaselines({ date, fetchedAt, requested, failures, samples, minimumJobSamples = 3 }) {
  const observations = z.array(observationSchema).parse(samples);
  const samplesByJob = new Map();
  for (const sample of observations) {
    const jobSamples = samplesByJob.get(sample.job) ?? [];
    jobSamples.push(sample);
    samplesByJob.set(sample.job, jobSamples);
  }
  const jobs = {};
  for (const [job, jobSamples] of [...samplesByJob].sort(([left], [right]) => left.localeCompare(right, 'ko'))) {
    if (jobSamples.length >= minimumJobSamples) jobs[job] = buildProfile(jobSamples);
  }
  return equipmentBaselinesSchema.parse({
    version: `${date}-dojang-v1`,
    source: { kind: 'nexon-open-api-dojang', url: 'https://openapi.nexon.com/ko/game/maplestory/?id=18' },
    date,
    fetchedAt,
    sample: { requested, succeeded: samples.length, failed: failures },
    global: buildProfile(observations),
    jobs,
  });
}

export async function loadEquipmentBaselines(fileUrl = new URL('../data/equipment-baselines.json', import.meta.url)) {
  return equipmentBaselinesSchema.parse(JSON.parse(await readFile(fileUrl, 'utf8')));
}

export async function collectEquipmentObservations({ service, ranking, date }) {
  const samples = [];
  let failures = 0;
  let consecutiveUpstreamFailures = 0;
  for (const entry of ranking) {
    try {
      const identity = await service.requestRaw('id', { character_name: entry.character_name });
      const equipment = await service.requestRaw('character/item-equipment', { ocid: identity.ocid, date });
      const items = Array.isArray(equipment?.item_equipment)
        ? equipment.item_equipment.filter((item) => item?.item_equipment_slot && item?.item_name)
        : [];
      if (!items.length) throw new Error('missing equipment');
      samples.push({
        job: entry.sub_class_name || entry.class_name,
        items: items.map(({ item_equipment_slot, item_name }) => ({ item_equipment_slot, item_name })),
      });
      consecutiveUpstreamFailures = 0;
    } catch (error) {
      if (['DAILY_LIMIT', 'UPSTREAM_LIMIT', 'NOT_CONFIGURED', 'SERVICE_CONFIGURATION', 'QUOTA_STORAGE'].includes(error.code)) throw error;
      failures += 1;
      if (['UPSTREAM_UNAVAILABLE', 'INVALID_RESPONSE', 'UPSTREAM_ERROR', 'DATA_UNAVAILABLE'].includes(error.code)) {
        consecutiveUpstreamFailures += 1;
        if (consecutiveUpstreamFailures >= 3) throw new Error('NEXON upstream failed three times in a row', { cause: error });
      } else {
        consecutiveUpstreamFailures = 0;
      }
    }
  }
  return { samples, failures };
}

export async function refreshEquipmentBaselines({ service, date, limit, output, fetchedAt = new Date().toISOString() }) {
  const rankingResponse = await service.requestRaw('ranking/dojang', {
    date, world_name: '', difficulty: '1', class: '', page: '1',
  });
  const ranking = Array.isArray(rankingResponse?.ranking) ? rankingResponse.ranking.slice(0, limit) : [];
  if (!ranking.length) throw new Error('NEXON dojang ranking returned no samples');
  const { samples, failures } = await collectEquipmentObservations({ service, ranking, date });
  assertObservationQuality({ requested: ranking.length, succeeded: samples.length });
  const result = buildEquipmentBaselines({ date, fetchedAt, requested: ranking.length, failures, samples });
  await mkdir(dirname(output), { recursive: true });
  const temporaryOutput = `${output}.${process.pid}.tmp`;
  await writeFile(temporaryOutput, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporaryOutput, output);
  return result;
}
