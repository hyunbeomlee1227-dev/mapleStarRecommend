import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { loadUpgradeRules } from '../server/rules.js';
import { createApp } from '../server/app.js';

test('upgrade rule catalog exposes verified costs and blocks incomplete calculations', async () => {
  const rules = await loadUpgradeRules();
  assert.equal(rules.version, '2026-09-11-v1');
  assert.equal(rules.capabilities.potentialResetCost.status, 'verified');
  assert.equal(rules.capabilities.starforceExpectedCost.status, 'unsupported');
  assert.equal(rules.capabilities.starforceExpectedCost.usableForRecommendation, false);
  assert.equal(rules.potentialResetCosts.regular[0].costs.legendary, 40_000_000);
  assert.equal(rules.potentialResetCosts.additional.at(-1).costs.legendary, 98_000_000);
});

test('upgrade rule endpoint returns a public status summary without secrets', async () => {
  const rules = await loadUpgradeRules();
  const goal = { id: 'lotus-hard', boss: '스우', difficulty: '하드' };
  const app = createApp({ service: { configured: false }, rules, goals: { goals: [goal], defaultGoalId: goal.id } });
  const response = await request(app).get('/api/rules');
  assert.equal(response.status, 200);
  assert.equal(response.body.version, rules.version);
  assert.deepEqual(response.body.summary, { verified: 1, partial: 1, unsupported: 2, total: 4 });
  assert.equal(JSON.stringify(response.body).includes('NEXON_API_KEY'), false);
  const recommendation = await request(app).post('/api/recommendations').send({
    goalId: goal.id,
    mode: 'all',
    budgetMesos: null,
    combat: { readiness: 'snapshot-ready' },
    items: [],
  });
  assert.equal(recommendation.body.rulesVersion, rules.version);
  assert.deepEqual(recommendation.body.blockers, ['potentialTargetProbability', 'starforceExpectedCost', 'bossDamageModel']);
});
