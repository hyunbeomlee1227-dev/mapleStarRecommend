import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createNexonService, snapshotDate, normalizeSnapshot, safeImage } from '../server/nexon.js';
import { responses, upstream } from './fixtures.js';

const now = () => Date.parse('2026-09-09T04:00:00Z');
function setup(raw = responses(), options = {}) {
  const fake = upstream(raw);
  const service = createNexonService({ apiKey: 'server-only-secret', now, intervalMs: 0, fetchImpl: fake.fetchImpl, ...options });
  return { ...fake, service, app: createApp({ service }) };
}
test('successful lookup preserves equipment details, caches and coalesces without exposing credentials', async () => {
  const { app, calls } = setup();
  const [first, second] = await Promise.all([request(app).get('/api/character?name=검증캐릭터'), request(app).get('/api/character?name=검증캐릭터')]);
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(calls.length, 5);
  assert.equal(first.body.items[0].item_add_option.str, '60');
  assert.equal(first.body.items[0].item_total_option.base_equipment_level, 200);
  assert.equal(first.body.items[0].item_description, '검증용 장비 설명');
  assert.equal(first.body.items[0].item_shape_name, '검증 장갑 외형');
  assert.equal(first.body.items[0].item_shape_icon, 'https://open.api.nexon.com/static/maplestory/item/shape.png');
  assert.equal(first.body.items[0].item_gender, '공용');
  assert.equal(first.body.items[0].equipment_level_increase, 3);
  assert.equal(first.body.items[0].growth_level, 2);
  assert.equal(first.body.items[0].scroll_resilience_count, '1');
  assert.equal(first.body.analysis.status, 'unverified');
  assert.equal(first.body.date, '2026-09-08');
  assert.ok(!first.text.includes('server-only-secret')); assert.ok(!first.text.includes('test-ocid'));
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.ok(calls.slice(1).every((call) => new URL(call.url).searchParams.get('date') === '2026-09-08'));
  assert.equal((await request(app).get('/api/character?name=검증캐릭터')).body.cached, true);
  assert.equal(calls.length, 5);
});

test('equipment lookup preserves duplicate parts and Maple upgrade metadata', async () => {
  const raw = responses();
  raw.equipment.item_equipment = [
    { ...raw.equipment.item_equipment[0], item_name: '첫 번째 반지', item_equipment_slot: '반지', item_equipment_part: '반지', scroll_upgrade: '8', scroll_upgradeable_count: '2', golden_hammer_flag: '적용' },
    { ...raw.equipment.item_equipment[0], item_name: '두 번째 반지', item_equipment_slot: '반지', item_equipment_part: '반지', scroll_upgrade: '5', scroll_upgradeable_count: '0', golden_hammer_flag: '미적용' },
  ];
  const { app } = setup(raw);
  const result = await request(app).get('/api/character?name=검증캐릭터');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map((item) => item.item_name), ['첫 번째 반지', '두 번째 반지']);
  assert.deepEqual(result.body.items.map((item) => item.scroll_upgrade), ['8', '5']);
  assert.deepEqual(result.body.items.map((item) => item.scroll_upgradeable_count), ['2', '0']);
  assert.deepEqual(result.body.items.map((item) => item.golden_hammer_flag), ['적용', '미적용']);
});
test('equipment lookup uses the strongest non-farming preset', async () => {
  const raw = responses();
  raw.equipment.preset_no = 1;
  raw.equipment.item_equipment_preset_1 = [{
    ...raw.equipment.item_equipment[0], item_name: '사냥 장갑',
    potential_option_1: '아이템 드롭률 : +20%',
  }];
  raw.equipment.item_equipment_preset_2 = [{
    ...raw.equipment.item_equipment[0], item_name: '보스 장갑',
    potential_option_1: '보스 몬스터 공격 시 데미지 : +40%',
  }];
  raw.equipment.item_equipment_preset_3 = null;
  const { app } = setup(raw);

  const result = await request(app).get('/api/character?name=검증캐릭터');

  assert.equal(result.status, 200);
  assert.equal(result.body.preset, 2);
  assert.deepEqual(result.body.items.map(({ item_name }) => item_name), ['보스 장갑']);
  assert.equal(result.body.presetSelection.status, 'selected');
  assert.deepEqual(result.body.presetSelection.excludedPresets, [{ preset: 1, reasons: ['아이템 획득'] }]);
});
test('invalid names and missing configuration do not call upstream', async () => {
  const { app, calls } = setup(responses(), { apiKey: '' });
  assert.equal((await request(app).get('/api/character?name=abc!')).status, 400);
  assert.equal((await request(app).get('/api/character?name=검증')).body.code, 'NOT_CONFIGURED');
  assert.equal((await request(app).get('/api/status')).body.configured, false);
  assert.equal(calls.length, 0);
});
test('an unequipped character remains valid while mixed dates fail', async () => {
  const raw = responses(); raw.equipment.item_equipment = null;
  const empty = await request(setup(raw).app).get('/api/character?name=검증');
  assert.equal(empty.status, 200); assert.deepEqual(empty.body.items, []);
  const mixed = responses(); mixed.stat.date = '2026-09-07';
  assert.throws(() => normalizeSnapshot(mixed, '2026-09-08', ''), { code: 'INCONSISTENT_DATA' });
});
test('upstream errors become safe actionable messages', async () => {
  for (const [status, code, expected] of [[400, 'OPENAPI00004', 'CHARACTER_NOT_FOUND'], [403, 'OPENAPI00005', 'SERVICE_CONFIGURATION'], [429, 'OPENAPI00007', 'UPSTREAM_LIMIT'], [400, 'OPENAPI00009', 'DATA_UNAVAILABLE']]) {
    const { app } = setup(responses(), { fetchImpl: async () => Response.json({ error: { name: code, message: 'server-only-secret' } }, { status }) });
    const result = await request(app).get('/api/character?name=검증');
    assert.equal(result.body.code, expected); assert.ok(!result.text.includes('server-only-secret'));
  }
  const { app } = setup(responses(), { fetchImpl: async () => { throw new Error('private'); } });
  assert.equal((await request(app).get('/api/character?name=검증')).body.code, 'UPSTREAM_UNAVAILABLE');
});
test('request limit cannot be bypassed by spoofed forwarded headers', async () => {
  const { service } = setup(); const app = createApp({ service, perMinute: 1 });
  await request(app).get('/api/character?name=검증').set('X-Forwarded-For', '1.2.3.4');
  const result = await request(app).get('/api/character?name=검증').set('X-Forwarded-For', '5.6.7.8');
  assert.equal(result.status, 429); assert.equal(result.headers['retry-after'], '60');
});
test('invalid request limit configuration is rejected before calling upstream', () => {
  assert.throws(() => createNexonService({ apiKey: 'key', intervalMs: Number.NaN }), { code: 'SERVICE_CONFIGURATION' });
  assert.throws(() => createNexonService({ apiKey: 'key', dailyLimit: 0 }), { code: 'SERVICE_CONFIGURATION' });
});
test('daily request budget survives service restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-test-'));
  try {
    const quotaFile = join(folder, 'quota.json');
    const one = setup(responses(), { quotaFile, dailyLimit: 5 });
    await one.service.lookup('첫조회');
    assert.equal(JSON.parse(await readFile(quotaFile, 'utf8')).count, 5);
    const two = setup(responses(), { quotaFile, dailyLimit: 5 });
    await assert.rejects(two.service.lookup('다른조회'), { code: 'DAILY_LIMIT' });
    assert.equal(two.calls.length, 0);
    await writeFile(quotaFile, '{broken');
    await assert.rejects(setup(responses(), { quotaFile }).service.lookup('검증'), { code: 'QUOTA_STORAGE' });
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test('cache expires and triggers a fresh snapshot', async () => {
  let time = now(); const { service, calls } = setup(responses(), { now: () => time, cacheTtl: 100 });
  await service.lookup('검증'); time += 101; await service.lookup('검증'); assert.equal(calls.length, 10);
});
test('KST cutoff uses the latest completed day; image URLs reject third parties', () => {
  assert.equal(snapshotDate(Date.parse('2026-09-08T16:59:00Z')), '2026-09-07');
  assert.equal(snapshotDate(Date.parse('2026-09-08T17:00:00Z')), '2026-09-08');
  assert.equal(safeImage('https://nexon.com.evil.example/a'), null);
  assert.equal(safeImage('javascript:alert(1)'), null);
});

test('raw NEXON requests omit blank optional query parameters', async () => {
  let requestedUrl;
  const service = createNexonService({
    apiKey: 'server-only-secret', now, intervalMs: 0,
    fetchImpl: async (url) => { requestedUrl = new URL(url); return Response.json({ ranking: [] }); },
  });
  await service.requestRaw('ranking/dojang', { date: '2026-09-10', world_name: '', difficulty: '1', class: '', page: '1' });

  assert.equal(requestedUrl.searchParams.get('date'), '2026-09-10');
  assert.equal(requestedUrl.searchParams.get('difficulty'), '1');
  assert.equal(requestedUrl.searchParams.has('world_name'), false);
  assert.equal(requestedUrl.searchParams.has('class'), false);
});

test('separate NEXON clients serialize updates to a shared quota file', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-quota-lock-'));
  try {
    const quotaFile = join(folder, 'quota.json');
    const options = {
      apiKey: 'server-only-secret', now, intervalMs: 0, quotaFile,
      fetchImpl: async () => Response.json({ ranking: [] }),
    };
    const first = createNexonService(options);
    const second = createNexonService(options);
    await Promise.all([
      first.requestRaw('ranking/dojang', { date: '2026-09-08', difficulty: '1' }),
      second.requestRaw('ranking/dojang', { date: '2026-09-08', difficulty: '1' }),
    ]);
    assert.equal(JSON.parse(await readFile(quotaFile, 'utf8')).count, 2);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('separate NEXON clients share the configured request interval', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-quota-interval-'));
  let time = 1000;
  const starts = [];
  try {
    const options = {
      apiKey: 'server-only-secret', intervalMs: 250, quotaFile: join(folder, 'quota.json'), now: () => time,
      sleep: async (milliseconds) => { time += milliseconds; },
      fetchImpl: async () => { starts.push(time); return Response.json({ ranking: [] }); },
    };
    await Promise.all([
      createNexonService(options).requestRaw('ranking/overall', { date: '2026-09-10', class: '전사-히어로' }),
      createNexonService(options).requestRaw('ranking/overall', { date: '2026-09-10', class: '마법사-비숍' }),
    ]);
    assert.equal(Math.abs(starts[1] - starts[0]), 250);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
