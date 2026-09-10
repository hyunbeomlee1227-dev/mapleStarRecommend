import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildRecommendationPlan, recommendationRequestSchema } from '../server/recommendation.js';
import { createApp } from '../server/app.js';

const goal = { id: 'lotus-hard', boss: '스우', difficulty: '하드' };
const combat = { readiness: 'snapshot-ready', message: 'ready' };
const items = [
  { item_name: '장갑', item_equipment_slot: '장갑', starforce: '18', potential_option_grade: '레전드리', additional_potential_option_grade: '에픽' },
  { item_name: '훈장', item_equipment_slot: '훈장', starforce: null, potential_option_grade: null, additional_potential_option_grade: null },
];

test('recommendation plan reports coverage but never invents rankings', () => {
  const result = buildRecommendationPlan({ goal, mode: 'all', budgetMesos: null, combat, items });
  assert.equal(result.status, 'model-pending');
  assert.deepEqual(result.coverage, { equipment: 2, starforce: 1, potential: 1, additionalPotential: 1 });
  assert.deepEqual(result.blockers, ['upgrade-rules', 'job-damage-model']);
  assert.equal('recommendations' in result, false);
});

test('budget mode requires a positive integer mesos budget', () => {
  assert.equal(recommendationRequestSchema.safeParse({ goalId: goal.id, mode: 'budget', budgetMesos: null, combat, items }).success, false);
  assert.equal(recommendationRequestSchema.safeParse({ goalId: goal.id, mode: 'budget', budgetMesos: 1_000_000_000, combat, items }).success, true);
});

test('recommendation endpoint validates input and returns selected goal context', async () => {
  const app = createApp({ service: { configured: false }, goals: { goals: [goal], defaultGoalId: goal.id } });
  const invalid = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'budget', budgetMesos: null, combat, items });
  assert.equal(invalid.status, 400);
  const response = await request(app).post('/api/recommendations').send({ goalId: goal.id, mode: 'all', budgetMesos: null, combat, items });
  assert.equal(response.status, 200);
  assert.equal(response.body.goal.id, goal.id);
  assert.equal(response.body.status, 'model-pending');
});
