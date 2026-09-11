import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertObservationQuality, buildEquipmentBaselines, collectEquipmentObservations, equipmentBaselinesSchema, loadEquipmentBaselines, refreshEquipmentBaselines } from '../server/equipment-baselines.js';

const samples = [
  { job: '히어로', items: [
    { item_equipment_slot: '모자', item_name: '에테르넬 나이트헬름' },
    { item_equipment_slot: '반지1', item_name: '거대한 공포' },
  ] },
  { job: '히어로', items: [
    { item_equipment_slot: '모자', item_name: '에테르넬 나이트헬름' },
    { item_equipment_slot: '반지2', item_name: '가디언 엔젤 링' },
  ] },
  { job: '히어로', items: [
    { item_equipment_slot: '모자', item_name: '하이네스 워리어헬름' },
    { item_equipment_slot: '반지1', item_name: '거대한 공포' },
  ] },
  { job: '아크메이지(불,독)', items: [
    { item_equipment_slot: '모자', item_name: '에테르넬 메이지햇' },
  ] },
];

test('equipment baselines aggregate normalized slots without retaining character names', () => {
  const result = buildEquipmentBaselines({ date: '2026-09-10', fetchedAt: '2026-09-11T01:00:00.000Z', requested: 5, failures: 1, samples });

  assert.equal(equipmentBaselinesSchema.safeParse(result).success, true);
  assert.deepEqual(result.sample, { requested: 5, succeeded: 4, failed: 1 });
  assert.deepEqual(result.global.slots['반지'], [
    { itemName: '거대한 공포', count: 2, slotItemShare: 2 / 3 },
    { itemName: '가디언 엔젤 링', count: 1, slotItemShare: 1 / 3 },
  ]);
  assert.equal(result.jobs['히어로'].sampleSize, 3);
  assert.equal(result.jobs['아크메이지(불,독)'], undefined);
  assert.equal(JSON.stringify(result).includes('characterName'), false);
});

test('equipment baselines reject impossible counts and unversioned sources', () => {
  assert.equal(equipmentBaselinesSchema.safeParse({}).success, false);
  assert.throws(() => assertObservationQuality({ requested: 20, succeeded: 1 }), /표본이 부족합니다/);
  assert.doesNotThrow(() => assertObservationQuality({ requested: 20, succeeded: 16 }));
});

test('equipment baselines reject observations without usable equipment', () => {
  assert.throws(() => buildEquipmentBaselines({
    date: '2026-09-10',
    fetchedAt: '2026-09-10T00:00:00.000Z',
    requested: 1,
    failures: 0,
    samples: [{ job: '히어로', items: [] }],
  }));
});

test('generated official baseline snapshot is valid and anonymized', async () => {
  const result = await loadEquipmentBaselines();
  assert.equal(result.version, '2026-09-10-dojang-v1');
  assert.deepEqual(result.sample, { requested: 20, succeeded: 20, failed: 0 });
  assert.equal(JSON.stringify(result).includes('character_name'), false);
});

test('observation collection stops immediately on fatal upstream limits', async () => {
  let calls = 0;
  const service = { requestRaw: async () => { calls += 1; throw Object.assign(new Error('limited'), { code: 'UPSTREAM_LIMIT' }); } };
  await assert.rejects(collectEquipmentObservations({ service, ranking: samples, date: '2026-09-10' }), { code: 'UPSTREAM_LIMIT' });
  assert.equal(calls, 1);
});

test('observation collection stops after three consecutive transient failures', async () => {
  let calls = 0;
  const service = { requestRaw: async () => { calls += 1; throw Object.assign(new Error('offline'), { code: 'UPSTREAM_UNAVAILABLE' }); } };
  await assert.rejects(collectEquipmentObservations({ service, ranking: samples, date: '2026-09-10' }), /three times in a row/);
  assert.equal(calls, 3);
});

test('refresh writes a validated snapshot through a unique temporary file', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-baseline-'));
  const output = join(folder, 'baseline.json');
  const ranking = Array.from({ length: 10 }, (_, index) => ({ character_name: `캐릭터${index}`, class_name: '히어로', sub_class_name: '' }));
  const service = { requestRaw: async (path) => {
    if (path === 'ranking/dojang') return { ranking };
    if (path === 'id') return { ocid: 'test-ocid' };
    return { item_equipment: [{ item_equipment_slot: '모자', item_name: '에테르넬 나이트헬름' }] };
  } };
  try {
    const result = await refreshEquipmentBaselines({ service, date: '2026-09-10', limit: 10, output, fetchedAt: '2026-09-11T01:00:00.000Z' });
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), result);
    assert.equal(result.sample.succeeded, 10);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
