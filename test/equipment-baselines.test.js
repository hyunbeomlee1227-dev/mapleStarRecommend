import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertObservationQuality, buildEquipmentBaselines, collectEquipmentObservations, equipmentBaselinesSchema, loadEquipmentBaselines, refreshEquipmentBaselines, refreshJobStratifiedEquipmentBaselines } from '../server/equipment-baselines.js';
import { MAPLE_FINAL_JOBS } from '../server/maple-jobs.js';

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
  assert.equal(result.version, '2026-09-11-overall-job-v2');
  assert.deepEqual(result.sample, { requested: 144, succeeded: 144, failed: 0 });
  assert.deepEqual(result.sampling, { strategy: 'job-stratified', samplesPerJob: 3, requestedJobs: 48, succeededJobs: 48 });
  assert.equal(Object.keys(result.jobs).length, 48);
  assert.equal(JSON.stringify(result).includes('character_name'), false);
});

test('job-stratified snapshots reject inconsistent profile and sample totals', async () => {
  const result = await loadEquipmentBaselines();
  const missingSampling = structuredClone(result);
  delete missingSampling.sampling;
  assert.equal(equipmentBaselinesSchema.safeParse(missingSampling).success, false);

  const missingJob = structuredClone(result);
  delete missingJob.jobs[Object.keys(missingJob.jobs)[0]];
  assert.equal(equipmentBaselinesSchema.safeParse(missingJob).success, false);

  const shortProfile = structuredClone(result);
  shortProfile.jobs[Object.keys(shortProfile.jobs)[0]].sampleSize -= 1;
  assert.equal(equipmentBaselinesSchema.safeParse(shortProfile).success, false);

  const wrongTotal = structuredClone(result);
  wrongTotal.sample.succeeded -= 1;
  wrongTotal.sample.failed += 1;
  assert.equal(equipmentBaselinesSchema.safeParse(wrongTotal).success, false);
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

test('final job catalog uses unique official dojang filters', () => {
  assert.equal(MAPLE_FINAL_JOBS.length, 48);
  assert.equal(new Set(MAPLE_FINAL_JOBS.map(({ filter }) => filter)).size, MAPLE_FINAL_JOBS.length);
  assert.equal(new Set(MAPLE_FINAL_JOBS.map(({ job }) => job)).size, MAPLE_FINAL_JOBS.length);
  assert.equal(MAPLE_FINAL_JOBS.some(({ filter, job }) => filter === '전사-히어로' && job === '히어로'), true);
  assert.equal(MAPLE_FINAL_JOBS.some(({ filter, job }) => filter === '레테-전체 전직' && job === '레테'), true);
});

test('job-stratified refresh requests and records equal samples per job', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-job-baseline-'));
  const output = join(folder, 'baseline.json');
  const classFilters = [{ filter: '전사-히어로', job: '히어로' }, { filter: '마법사-비숍', job: '비숍' }];
  const rankingFilters = [];
  const service = { requestRaw: async (path, params) => {
    if (path === 'ranking/overall') {
      assert.equal(params.world_type, '0');
      rankingFilters.push(params.class);
      const job = classFilters.find(({ filter }) => filter === params.class).job;
      return { ranking: Array.from({ length: 3 }, (_, index) => ({ character_name: `${params.class}-${index}`, class_name: job, sub_class_name: '' })) };
    }
    if (path === 'id') return { ocid: params.character_name };
    return { item_equipment: [{ item_equipment_slot: '모자', item_name: '에테르넬 모자' }] };
  } };
  try {
    const result = await refreshJobStratifiedEquipmentBaselines({ service, date: '2026-09-10', samplesPerJob: 3, classFilters, output, fetchedAt: '2026-09-11T01:00:00.000Z' });
    assert.deepEqual(rankingFilters, ['전사-히어로', '마법사-비숍']);
    assert.deepEqual(result.sampling, { strategy: 'job-stratified', samplesPerJob: 3, requestedJobs: 2, succeededJobs: 2 });
    assert.equal(result.jobs['히어로'].sampleSize, 3);
    assert.equal(result.jobs['비숍'].sampleSize, 3);
    assert.equal(result.version, '2026-09-10-overall-job-v2');
    assert.equal(result.source.kind, 'nexon-open-api-overall-ranking');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('job-stratified refresh rejects invalid sample counts before API calls', async () => {
  let calls = 0;
  const service = { requestRaw: async () => { calls += 1; } };
  await assert.rejects(refreshJobStratifiedEquipmentBaselines({
    service, date: '2026-09-10', samplesPerJob: 2,
    classFilters: [{ filter: '전사-히어로', job: '히어로' }], output: 'unused.json',
  }), /3에서 20 사이/);
  assert.equal(calls, 0);
});

test('job-stratified refresh rejects a mismatched official class response', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-job-baseline-mismatch-'));
  const output = join(folder, 'baseline.json');
  const service = { requestRaw: async () => ({ ranking: Array.from({ length: 3 }, (_, index) => ({ character_name: `불일치${index}`, class_name: '팔라딘', sub_class_name: '' })) }) };
  try {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(output, 'previous'));
    await assert.rejects(refreshJobStratifiedEquipmentBaselines({ service, date: '2026-09-10', samplesPerJob: 3, classFilters: [{ filter: '전사-히어로', job: '히어로' }], output }), /필터 응답이 일치하지 않습니다/);
    assert.equal(await readFile(output, 'utf8'), 'previous');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('job-stratified refresh preserves the previous file when any job sample is short', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-job-baseline-short-'));
  const output = join(folder, 'baseline.json');
  const service = { requestRaw: async (path) => path === 'ranking/overall'
    ? { ranking: [{ character_name: '한명' }] }
    : path === 'id' ? { ocid: 'one' } : { item_equipment: [{ item_equipment_slot: '모자', item_name: '모자' }] } };
  try {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(output, 'previous'));
    await assert.rejects(refreshJobStratifiedEquipmentBaselines({ service, date: '2026-09-10', samplesPerJob: 3, classFilters: [{ filter: '전사-히어로', job: '히어로' }], output }), /직업별 표본이 부족합니다/);
    assert.equal(await readFile(output, 'utf8'), 'previous');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
