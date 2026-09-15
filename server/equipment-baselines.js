import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { writeFileAtomically } from './file-write.js';
import { selectBossEquipmentPreset } from './equipment-preset.js';

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
const samplingSchema = z.object({
  strategy: z.literal('job-stratified'),
  samplesPerJob: z.number().int().min(3).max(20),
  requestedJobs: z.number().int().positive(),
  succeededJobs: z.number().int().nonnegative(),
}).refine(({ requestedJobs, succeededJobs }) => succeededJobs <= requestedJobs, '직업 표본 집계 수가 올바르지 않습니다.');

export const equipmentBaselinesSchema = z.object({
  version: z.string().min(1),
  source: z.object({
    kind: z.enum(['nexon-open-api-dojang', 'nexon-open-api-overall-ranking']),
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
  sampling: samplingSchema.optional(),
}).superRefine((snapshot, context) => {
  if (!snapshot.sampling) {
    if (snapshot.source.kind === 'nexon-open-api-overall-ranking') {
      context.addIssue({
        code: 'custom',
        message: '종합 랭킹 스냅샷에는 직업별 균등 표본 메타데이터가 필요합니다.',
        path: ['sampling'],
      });
    }
    return;
  }

  const { samplesPerJob, requestedJobs, succeededJobs } = snapshot.sampling;
  const profiles = Object.values(snapshot.jobs);
  const expectedSamples = requestedJobs * samplesPerJob;
  const consistent = requestedJobs === succeededJobs
    && profiles.length === requestedJobs
    && profiles.every(({ sampleSize }) => sampleSize === samplesPerJob)
    && snapshot.sample.requested === expectedSamples
    && snapshot.sample.succeeded === expectedSamples
    && snapshot.sample.failed === 0
    && snapshot.global.sampleSize === expectedSamples
    && profiles.reduce((total, { sampleSize }) => total + sampleSize, 0) === expectedSamples;

  if (!consistent) {
    context.addIssue({
      code: 'custom',
      message: '직업별 균등 표본 메타데이터와 실제 프로필이 일치하지 않습니다.',
      path: ['sampling'],
    });
  }
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

export function buildEquipmentBaselines({ date, fetchedAt, requested, failures, samples, minimumJobSamples = 3, sampling = undefined, sourceKind = 'nexon-open-api-dojang' }) {
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
    version: sourceKind === 'nexon-open-api-overall-ranking' ? `${date}-overall-job-v2` : sampling ? `${date}-dojang-job-v2` : `${date}-dojang-v1`,
    source: { kind: sourceKind, url: 'https://openapi.nexon.com/ko/game/maplestory/?id=18' },
    date,
    fetchedAt,
    sample: { requested, succeeded: samples.length, failed: failures },
    global: buildProfile(observations),
    jobs,
    ...(sampling ? { sampling } : {}),
  });
}

export async function loadEquipmentBaselines(fileUrl = new URL('../data/equipment-baselines.json', import.meta.url)) {
  return equipmentBaselinesSchema.parse(JSON.parse(await readFile(fileUrl, 'utf8')));
}

export async function collectEquipmentObservations({ service, ranking, date, jobOverride = null }) {
  const samples = [];
  let failures = 0;
  let consecutiveUpstreamFailures = 0;
  for (const entry of ranking) {
    try {
      const identity = await service.requestRaw('id', { character_name: entry.character_name });
      const equipment = await service.requestRaw('character/item-equipment', { ocid: identity.ocid, date });
      const selected = selectBossEquipmentPreset({
        activePreset: equipment?.preset_no ?? null,
        currentItems: equipment?.item_equipment ?? [],
        presets: [1, 2, 3].map((preset) => ({ preset, items: equipment?.[`item_equipment_preset_${preset}`] ?? [] })),
      });
      const items = selected.items.filter((item) => item?.item_equipment_slot && item?.item_name);
      if (!items.length) throw new Error('missing equipment');
      samples.push({
        job: jobOverride || entry.sub_class_name || entry.class_name,
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

async function writeEquipmentBaselines(output, result) {
  await writeFileAtomically(output, `${JSON.stringify(result, null, 2)}\n`);
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
  await writeEquipmentBaselines(output, result);
  return result;
}

export async function refreshJobStratifiedEquipmentBaselines({ service, date, samplesPerJob, classFilters, output, fetchedAt = new Date().toISOString() }) {
  if (!Number.isSafeInteger(samplesPerJob) || samplesPerJob < 3 || samplesPerJob > 20) {
    throw new Error('직업별 표본 수는 3에서 20 사이의 정수여야 합니다.');
  }
  if (!Array.isArray(classFilters) || classFilters.length === 0) throw new Error('직업 필터가 필요합니다.');
  const samples = [];
  let failures = 0;
  for (const { filter, job } of classFilters) {
    const rankingResponse = await service.requestRaw('ranking/overall', {
      date, world_name: '', world_type: '0', class: filter, page: '1',
    });
    const ranking = Array.isArray(rankingResponse?.ranking) ? rankingResponse.ranking.slice(0, samplesPerJob) : [];
    if (ranking.length < samplesPerJob) throw new Error(`${job} 직업별 표본이 부족합니다. ${ranking.length}/${samplesPerJob}`);
    if (ranking.some((entry) => (entry.sub_class_name || entry.class_name) !== job)) {
      throw new Error(`${job} 직업 필터 응답이 일치하지 않습니다.`);
    }
    const collected = await collectEquipmentObservations({ service, ranking, date, jobOverride: job });
    if (collected.samples.length < samplesPerJob) throw new Error(`${job} 직업별 표본이 부족합니다. ${collected.samples.length}/${samplesPerJob}`);
    samples.push(...collected.samples);
    failures += collected.failures;
  }
  const sampling = {
    strategy: 'job-stratified', samplesPerJob, requestedJobs: classFilters.length, succeededJobs: classFilters.length,
  };
  const result = buildEquipmentBaselines({
    date, fetchedAt, requested: classFilters.length * samplesPerJob, failures, samples, minimumJobSamples: samplesPerJob, sampling,
    sourceKind: 'nexon-open-api-overall-ranking',
  });
  await writeEquipmentBaselines(output, result);
  return result;
}
