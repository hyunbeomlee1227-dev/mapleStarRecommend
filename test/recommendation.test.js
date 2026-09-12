import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildRecommendationPlan, recommendationRequestSchema } from '../server/recommendation.js';
import { createApp } from '../server/app.js';
import { loadUpgradeRules } from '../server/rules.js';
import { loadEquipmentTargets } from '../server/equipment-targets.js';

const goal = { id: 'lotus-hard', boss: '스우', difficulty: '하드', order: 20 };
const equipmentTargets = {
  version: 'test-v1',
  updatedAt: '2026-09-11',
  rules: [{
    id: 'estella-22-before-extreme-lotus',
    itemNames: ['에스텔라 이어링'],
    minGoalOrder: 0,
    maxGoalOrder: 20,
    target: { starforce: 22 },
    reason: '익스트림 스우 미만 솔로 보스 목표에서 사용하는 장비 목표입니다.',
  }],
};
const combat = { readiness: 'snapshot-ready', message: 'ready' };
const items = [
  { item_name: '장갑', item_equipment_slot: '장갑', baseEquipmentLevel: 200, starforce: '18', potential_option_grade: '유니크', additional_potential_option_grade: '에픽' },
  { item_name: '훈장', item_equipment_slot: '훈장', baseEquipmentLevel: 200, starforce: '0', potential_option_grade: null, additional_potential_option_grade: null },
  { item_name: '모자', item_equipment_slot: '모자', baseEquipmentLevel: 150, starforce: '0', potential_option_grade: null, additional_potential_option_grade: null },
];

test('recommendation plan reports coverage but never invents rankings', () => {
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items });
  assert.equal(result.status, 'model-pending');
  assert.deepEqual(result.coverage, { equipment: 3, starforce: 2, potential: 1, additionalPotential: 1 });
  assert.deepEqual(result.blockers, ['upgrade-rules', 'job-damage-model']);
  assert.equal('recommendations' in result, false);
});

test('budget mode requires a positive integer mesos budget', () => {
  assert.equal(recommendationRequestSchema.safeParse({ goalId: goal.id, mode: 'budget', budgetMesos: null, combat, items }).success, false);
  assert.equal(recommendationRequestSchema.safeParse({ goalId: goal.id, mode: 'budget', budgetMesos: 1_000_000_000, combat, items }).success, true);
});

test('curated equipment target recommends Estella 22 stars only below Extreme Lotus', () => {
  const estella = { item_name: '에스텔라 이어링', item_equipment_slot: '귀고리', baseEquipmentLevel: 160, starforce: '17', potential_option_grade: '유니크', additional_potential_option_grade: '에픽' };
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items: [estella], equipmentTargets });
  assert.deepEqual(result.equipmentRecommendations, [{
    ruleId: 'estella-22-before-extreme-lotus',
    sourceKind: 'curated-rule',
    itemName: '에스텔라 이어링',
    slot: '귀고리',
    current: { starforce: 17 },
    target: { starforce: 22 },
    actions: ['스타포스 17성 -> 22성'],
    reason: '익스트림 스우 미만 솔로 보스 목표에서 사용하는 장비 목표입니다.',
  }]);
  assert.equal(result.equipmentTargetTrace.version, 'test-v1');
  assert.equal(result.equipmentTargetTrace.budgetApplied, false);
  assert.equal('expectedFinalDamage' in result.equipmentRecommendations[0], false);

  const extremeResult = buildRecommendationPlan({ goal: { ...goal, id: 'lotus-extreme', difficulty: '익스트림', order: 30 }, mode: 'all', budgetMesos: null, combat, items: [estella], equipmentTargets });
  assert.deepEqual(extremeResult.equipmentRecommendations, []);

  const completedResult = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items: [{ ...estella, starforce: '22' }], equipmentTargets });
  assert.deepEqual(completedResult.equipmentRecommendations, []);
});

test('equipment target catalog is validated and versioned', async () => {
  const catalog = await loadEquipmentTargets();
  assert.equal(catalog.version, '2026-09-11-v4');
  assert.equal(catalog.rules[0].id, 'general-equipment-17-normal-lotus');
  assert.equal(catalog.rules.some((rule) => rule.id === 'astra-secondary-22-lategame'), true);
});

test('general job baseline applies by normalized slot and keeps only the strongest target', () => {
  const targets = {
    version: 'general-v1', updatedAt: '2026-09-11',
    rules: [
      { id: 'general-18', slots: ['반지', '장갑'], minEquipmentLevel: 130, minGoalOrder: 20, maxGoalOrder: 20, target: { starforce: 18 }, reason: '직업 공통 기준' },
      { id: 'long-term-ring-22', itemNames: ['가디언 엔젤 링'], minGoalOrder: 20, maxGoalOrder: 20, target: { starforce: 22 }, reason: '장기 사용 장비군 기준' },
    ],
  };
  const baselineItems = [
    { item_name: '가디언 엔젤 링', item_equipment_slot: '반지2', baseEquipmentLevel: 160, starforce: '17' },
    { item_name: '앱솔랩스 나이트글러브', item_equipment_slot: '장갑', baseEquipmentLevel: 160, starforce: '17' },
    { item_name: '리스트레인트 링', item_equipment_slot: '반지1', baseEquipmentLevel: 110, starforce: '0', special_ring_level: 4 },
  ];
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items: baselineItems, equipmentTargets: targets });

  assert.deepEqual(result.equipmentRecommendations, [
    {
      ruleId: 'long-term-ring-22', sourceKind: 'curated-rule', itemName: '가디언 엔젤 링', slot: '반지2',
      current: { starforce: 17 }, target: { starforce: 22 }, actions: ['스타포스 17성 -> 22성'], reason: '장기 사용 장비군 기준',
    },
    {
      ruleId: 'general-18', sourceKind: 'curated-rule', itemName: '앱솔랩스 나이트글러브', slot: '장갑',
      current: { starforce: 17 }, target: { starforce: 18 }, actions: ['스타포스 17성 -> 18성'], reason: '직업 공통 기준',
    },
  ]);
});

test('equipment family targets evaluate every matching equipped item', () => {
  const familyTargets = {
    version: 'family-v1', updatedAt: '2026-09-11',
    rules: [{ id: 'eternal-family', itemNamePrefixes: ['에테르넬 '], minGoalOrder: 30, maxGoalOrder: 180, target: { starforce: 22 }, reason: '에테르넬 장비 목표' }],
  };
  const lateGoal = { id: 'kalos-chaos', boss: '감시자 칼로스', difficulty: '카오스', order: 80 };
  const familyItems = [
    { item_name: '에테르넬 나이트헬름', item_equipment_slot: '모자', starforce: '21' },
    { item_name: '에테르넬 나이트아머', item_equipment_slot: '상의', starforce: '20' },
    { item_name: '에테르넬 나이트팬츠', item_equipment_slot: '하의', starforce: '22' },
  ];
  const result = buildRecommendationPlan({ goal: lateGoal, mode: 'all', budgetMesos: null, combat, items: familyItems, equipmentTargets: familyTargets });
  assert.deepEqual(result.equipmentRecommendations.map(({ itemName, actions }) => ({ itemName, actions })), [
    { itemName: '에테르넬 나이트헬름', actions: ['스타포스 21성 -> 22성'] },
    { itemName: '에테르넬 나이트아머', actions: ['스타포스 20성 -> 22성'] },
  ]);
});

test('job equipment observations are exposed as reference data, not efficiency rankings', () => {
  const equipmentBaselines = {
    version: '2026-09-10-overall-job-v2', date: '2026-09-10',
    sampling: { strategy: 'job-stratified', samplesPerJob: 3, requestedJobs: 48, succeededJobs: 48 },
    jobs: { 히어로: { sampleSize: 3, slots: { 모자: [
      { itemName: '에테르넬 나이트헬름', count: 2, slotItemShare: 2 / 3 },
      { itemName: '하이네스 워리어헬름', count: 1, slotItemShare: 1 / 3 },
    ] } } },
  };
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, characterJob: '히어로', items, equipmentBaselines });
  assert.deepEqual(result.jobEquipmentReference, {
    status: 'available', job: '히어로', sampleSize: 3, date: '2026-09-10', version: '2026-09-10-overall-job-v2',
    slots: [{ slot: '모자', equippedItems: ['모자'], observed: [
      { itemName: '에테르넬 나이트헬름', count: 2, slotItemShare: 2 / 3 },
      { itemName: '하이네스 워리어헬름', count: 1, slotItemShare: 1 / 3 },
    ] }],
  });
  assert.equal('efficiency' in result.jobEquipmentReference.slots[0], false);
});

test('job equipment observations preserve duplicate and non-starforce equipment independently of combat readiness', () => {
  const equipmentBaselines = {
    version: 'observed-v2', date: '2026-09-10', sampling: { strategy: 'job-stratified', samplesPerJob: 3 },
    jobs: { 히어로: { sampleSize: 3, slots: { 반지: [{ itemName: '거대한 공포', count: 3, slotItemShare: 0.25 }] } } },
  };
  const rings = [
    { item_name: '가디언 엔젤 링', item_equipment_slot: '반지1', starforce: '18' },
    { item_name: '리스트레인트 링', item_equipment_slot: '반지2', starforce: '0', special_ring_level: 4 },
  ];
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat: { readiness: 'missing', message: '부족' }, characterJob: '히어로', items: rings, equipmentBaselines });
  assert.equal(result.status, 'insufficient-data');
  assert.deepEqual(result.jobEquipmentReference.slots[0].equippedItems, ['가디언 엔젤 링', '리스트레인트 링']);
});

test('recommendation endpoint validates input and returns selected goal context', async () => {
  const rules = await loadUpgradeRules();
  const app = createApp({ service: { configured: false }, rules, equipmentTargets, goals: { goals: [goal], defaultGoalId: goal.id } });
  const apiItems = [...items, {
    item_name: '23성 검증 장비', item_equipment_slot: '상의', baseEquipmentLevel: 200, starforce: '23',
    potential_option_grade: null, additional_potential_option_grade: null,
  }];
  const invalid = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'budget', budgetMesos: null, combat, items });
  assert.equal(invalid.status, 400);
  const response = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'all', budgetMesos: null, combat, items: apiItems });
  assert.equal(response.status, 200);
  assert.equal(response.body.goal.id, goal.id);
  assert.equal(response.body.status, 'model-pending');
  assert.equal(response.body.equipmentTargetTrace.version, 'test-v1');
  assert.deepEqual(response.body.supportedCalculations.potentialTierUpgrades[0], {
    type: 'potential-tier-upgrade',
    potentialType: 'regular',
    itemName: '장갑',
    slot: '장갑',
    equipmentLevel: 200,
    currentGrade: 'unique',
    nextGrade: 'legendary',
    resetCost: 38_250_000,
    successProbability: 0.014,
    guaranteeFailures: 107,
  });
  assert.equal(response.body.supportedCalculations.potentialTierUpgrades.length, 2);
  assert.deepEqual(response.body.supportedCalculations.starforceRisks[0], {
    type: 'starforce-risk', itemName: '장갑', slot: '장갑', currentStar: 18,
    successProbability: 0.1575, maintainProbability: 0.7751, destroyProbability: 0.0674,
    traceRecoveryStar: 18, intactRecoveryCopies: 1, intactRecoveryMeso: 4_005_000_000,
    attemptCost: 324_061_900, expectedMesoWithOwnedRecoveryItems: 3_771_421_587,
    expectedRecoveryCopies: 0.42793650793650795,
    costSource: 'mesu-live-community-model',
  });
  assert.equal(response.body.supportedCalculations.starforceRisks[1].traceRecoveryStar, null);
  assert.equal(response.body.supportedCalculations.starforceRisks[1].intactRecoveryCopies, null);
  assert.deepEqual(response.body.supportedCalculations.starforceRisks[2], {
    type: 'starforce-risk', itemName: '23성 검증 장비', slot: '상의', currentStar: 23,
    successProbability: 0.105, maintainProbability: 0.716, destroyProbability: 0.179,
    traceRecoveryStar: 22, intactRecoveryCopies: 4, intactRecoveryMeso: 24_168_000_000,
    attemptCost: 213_124_000, expectedMesoWithOwnedRecoveryItems: 89_365_046_797,
    expectedRecoveryCopies: 14.114346182917625,
    costSource: 'mesu-live-community-model',
  });
});
