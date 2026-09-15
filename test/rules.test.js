import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadUpgradeRules } from '../server/rules.js';
import { createApp } from '../server/app.js';

test('upgrade rule catalog exposes verified costs and blocks incomplete calculations', async () => {
  const rules = await loadUpgradeRules();
  assert.equal(rules.version, '2026-09-15-v10');
  assert.equal(rules.capabilities.potentialResetCost.status, 'verified');
  assert.equal(rules.capabilities.potentialTierUpgrade.status, 'verified');
  assert.equal(rules.capabilities.potentialTierUpgrade.usableForRecommendation, true);
  assert.equal(rules.capabilities.starforceExpectedCost.status, 'partial');
  assert.equal(rules.capabilities.starforceExpectedCost.usableForRecommendation, false);
  assert.equal(rules.capabilities.bossDamageModel.status, 'partial');
  assert.equal(rules.potentialResetCosts.regular[0].costs.legendary, 40_000_000);
  assert.equal(rules.potentialResetCosts.additional.at(-1).costs.legendary, 98_000_000);
  assert.deepEqual(rules.potentialTierUpgrades.regular.unique, {
    nextGrade: 'legendary', successProbability: 0.014, guaranteeAttempts: 107,
  });
  assert.deepEqual(rules.starforceOutcomes['22'], {
    successProbability: 0.1575, maintainProbability: 0.674, destroyProbability: 0.1685,
  });
  assert.deepEqual(rules.starforceCostModel, {
    sourceKind: 'community', sourceUrl: 'https://github.com/kurateh/mesulive',
    verifiedAgainst: '2026-03-21', minLevel: 1, maxLevel: 300,
  });
  assert.deepEqual(rules.starforcePermanentBenefits.mvpDiscountRates, {
    none: 0, silver: 0.03, gold: 0.05, diamond: 0.1, red: 0.1, black: 0.1,
  });
  assert.equal(rules.starforcePermanentBenefits.pcRoomDiscountRate, 0.05);
  assert.equal(rules.starforcePermanentBenefits.discountUntilStar, 17);
  assert.deepEqual(rules.starforceRestoreResources.levels['200']['18'], {
    requiredCopies: 1,
    restoreMeso: 4_005_000_000,
  });
  assert.match(rules.starforceRestoreResources.sourceUrl, /5361818/);
});

test('upgrade rule endpoint returns a public status summary without secrets', async () => {
  const rules = await loadUpgradeRules();
  const goal = { id: 'lotus-hard', boss: '스우', difficulty: '하드' };
  const app = createApp({ service: { configured: false }, rules, goals: { goals: [goal], defaultGoalId: goal.id } });
  const response = await request(app).get('/api/rules');
  assert.equal(response.status, 200);
  assert.equal(response.body.version, rules.version);
  assert.deepEqual(response.body.summary, { verified: 2, partial: 3, unsupported: 0, total: 5 });
  assert.equal(JSON.stringify(response.body).includes('NEXON_API_KEY'), false);
  const recommendation = await request(app).post('/api/recommendations').send({
    goalId: goal.id,
    mode: 'all',
    budgetMesos: null,
    combat: { readiness: 'snapshot-ready' },
    items: [],
  });
  assert.equal(recommendation.body.rulesVersion, rules.version);
  assert.equal(recommendation.body.rulesUpdatedAt, rules.updatedAt);
  assert.deepEqual(recommendation.body.blockers, ['potentialTargetProbability', 'starforceExpectedCost', 'bossDamageModel']);
  const unknownGoal = await request(app).post('/api/recommendations').send({
    goalId: 'unknown', mode: 'all', budgetMesos: null, combat: { readiness: 'snapshot-ready' }, items: [],
  });
  assert.equal(unknownGoal.body.rulesVersion, rules.version);
  assert.equal(unknownGoal.body.rulesUpdatedAt, rules.updatedAt);
});

test('verified potential cost bands must cover levels 1 through 300 exactly once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maple-rules-'));
  const file = join(directory, 'rules.json');
  try {
    const source = JSON.parse(await readFile(new URL('../data/upgrade-rules.json', import.meta.url), 'utf8'));
    source.potentialResetCosts.regular[1].minLevel = 159;
    await writeFile(file, JSON.stringify(source));
    await assert.rejects(loadUpgradeRules(file), /연속되어야 합니다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('starforce recovery tables reject missing stages and incorrect copy counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maple-restore-rules-'));
  const source = JSON.parse(await readFile(new URL('../data/upgrade-rules.json', import.meta.url), 'utf8'));
  try {
    const missingStage = structuredClone(source);
    delete missingStage.starforceRestoreResources.levels['200']['18'];
    const missingFile = join(directory, 'missing.json');
    await writeFile(missingFile, JSON.stringify(missingStage));
    await assert.rejects(loadUpgradeRules(missingFile), /강화 단계가 완전하지 않습니다/);

    const wrongCopies = structuredClone(source);
    wrongCopies.starforceRestoreResources.levels['200']['21'].requiredCopies = 1;
    const copiesFile = join(directory, 'copies.json');
    await writeFile(copiesFile, JSON.stringify(wrongCopies));
    await assert.rejects(loadUpgradeRules(copiesFile), /장비 개수가 공식 구간 규칙과 다릅니다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
