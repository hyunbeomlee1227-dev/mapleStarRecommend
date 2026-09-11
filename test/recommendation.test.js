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
    reason: '익스트림 스우 미만 솔로 보스 목표에서 사용하는 관리자 기준 장비 목표입니다.',
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

test('administrator equipment target recommends Estella 22 stars only below Extreme Lotus', () => {
  const estella = { item_name: '에스텔라 이어링', item_equipment_slot: '귀고리', baseEquipmentLevel: 160, starforce: '17', potential_option_grade: '유니크', additional_potential_option_grade: '에픽' };
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items: [estella], equipmentTargets });
  assert.deepEqual(result.equipmentRecommendations, [{
    ruleId: 'estella-22-before-extreme-lotus',
    sourceKind: 'administrator',
    itemName: '에스텔라 이어링',
    slot: '귀고리',
    current: { starforce: 17 },
    target: { starforce: 22 },
    actions: ['스타포스 17성 -> 22성'],
    reason: '익스트림 스우 미만 솔로 보스 목표에서 사용하는 관리자 기준 장비 목표입니다.',
  }]);
  assert.equal(result.equipmentTargetTrace.version, 'test-v1');
  assert.equal(result.equipmentTargetTrace.budgetApplied, false);
  assert.equal('expectedFinalDamage' in result.equipmentRecommendations[0], false);

  const extremeResult = buildRecommendationPlan({ goal: { ...goal, id: 'lotus-extreme', difficulty: '익스트림', order: 30 }, mode: 'all', budgetMesos: null, combat, items: [estella], equipmentTargets });
  assert.deepEqual(extremeResult.equipmentRecommendations, []);

  const completedResult = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items: [{ ...estella, starforce: '22' }], equipmentTargets });
  assert.deepEqual(completedResult.equipmentRecommendations, []);
});

test('administrator equipment target catalog is validated and versioned', async () => {
  const catalog = await loadEquipmentTargets();
  assert.equal(catalog.version, '2026-09-11-v1');
  assert.equal(catalog.rules[0].id, 'estella-22-before-extreme-lotus');
});

test('recommendation endpoint validates input and returns selected goal context', async () => {
  const rules = await loadUpgradeRules();
  const app = createApp({ service: { configured: false }, rules, equipmentTargets, goals: { goals: [goal], defaultGoalId: goal.id } });
  const invalid = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'budget', budgetMesos: null, combat, items });
  assert.equal(invalid.status, 400);
  const response = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'all', budgetMesos: null, combat, items });
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
    traceRecoveryStar: 18, intactRecoveryCopies: 1, attemptCost: 324_061_900,
    expectedMesoWithoutSpares: 3_151_795_078,
    costSource: 'mesu-live-community-model',
  });
  assert.equal(response.body.supportedCalculations.starforceRisks[1].traceRecoveryStar, null);
  assert.equal(response.body.supportedCalculations.starforceRisks[1].intactRecoveryCopies, null);
});
