import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextStarCost, calculateStarforceTargetCost, starforceAttemptCost } from '../server/starforce.js';

const outcome = { successProbability: 0.1575, maintainProbability: 0.7751, destroyProbability: 0.0674 };
const resources = { '200': { '18': { requiredCopies: 1, restoreMeso: 4_005_000_000 } } };

test('next-star cost separates owned recovery items from meso expectation', () => {
  const result = calculateNextStarCost({ level: 200, star: 18, outcome, restoreResources: resources });

  assert.deepEqual(result, {
    attemptCost: 324_061_900,
    recovery: { targetStar: 18, requiredCopies: 1, restoreMeso: 4_005_000_000 },
    expectedMesoWithOwnedRecoveryItems: 3_771_421_587,
    expectedRecoveryCopies: 0.42793650793650795,
  });
});

test('non-destructive stars need no recovery resources', () => {
  const result = calculateNextStarCost({
    level: 200,
    star: 14,
    outcome: { successProbability: 0.315, maintainProbability: 0.685, destroyProbability: 0 },
    restoreResources: resources,
  });

  assert.equal(result.attemptCost, starforceAttemptCost(200, 14));
  assert.equal(result.recovery, null);
  assert.equal(result.expectedMesoWithOwnedRecoveryItems, Math.round(result.attemptCost / 0.315));
  assert.equal(result.expectedRecoveryCopies, 0);
});

test('destructive stars without recovery data do not invent an expectation', () => {
  assert.deepEqual(calculateNextStarCost({ level: 180, star: 18, outcome, restoreResources: resources }), {
    attemptCost: starforceAttemptCost(180, 18),
    recovery: null,
    expectedMesoWithOwnedRecoveryItems: null,
    expectedRecoveryCopies: null,
  });
});

test('stars above 22 include recovery to 22 and the climb back to the current star', () => {
  const outcomes = {
    '22': { successProbability: 0.1575, maintainProbability: 0.674, destroyProbability: 0.1685 },
    '23': { successProbability: 0.105, maintainProbability: 0.716, destroyProbability: 0.179 },
  };
  const highStarResources = { '200': { '22': { requiredCopies: 4, restoreMeso: 24_168_000_000 } } };
  assert.deepEqual(calculateNextStarCost({
    level: 200,
    star: 23,
    outcome: outcomes['23'],
    outcomes,
    restoreResources: highStarResources,
  }), {
    attemptCost: starforceAttemptCost(200, 23),
    recovery: { targetStar: 22, requiredCopies: 4, restoreMeso: 24_168_000_000 },
    expectedMesoWithOwnedRecoveryItems: 89_365_046_797,
    expectedRecoveryCopies: 14.114346182917625,
  });
});

test('target cost sums every star step and reports cost per gained star', () => {
  const outcomes = Object.fromEntries([17, 18, 19, 20, 21].map((star) => [String(star), {
    successProbability: 0.5, maintainProbability: 0.5, destroyProbability: 0,
  }]));
  const result = calculateStarforceTargetCost({ level: 200, currentStar: 18, targetStar: 22, outcomes, restoreResources: {} });
  const expected = [18, 19, 20, 21].reduce((sum, star) => sum + Math.round(starforceAttemptCost(200, star) / 0.5), 0);
  assert.deepEqual(result, { expectedMeso: expected, expectedRecoveryCopies: 0, starsGained: 4, expectedMesoPerStar: Math.round(expected / 4) });
});

test('MVP and PC room discounts stack only while upgrading to 17 stars', () => {
  const conditions = { discountRate: 0.15, discountUntilStar: 17 };
  const base16 = starforceAttemptCost(200, 16);
  const discounted16 = starforceAttemptCost(200, 16, conditions);
  assert.equal(discounted16, Math.round(base16 * 0.85));
  assert.equal(starforceAttemptCost(200, 17, conditions), starforceAttemptCost(200, 17));
});

test('target costs apply the selected permanent starforce benefits', () => {
  const outcomes = Object.fromEntries([15, 16].map((star) => [String(star), {
    successProbability: 1, maintainProbability: 0, destroyProbability: 0,
  }]));
  const base = calculateStarforceTargetCost({ level: 200, currentStar: 15, targetStar: 17, outcomes, restoreResources: {} });
  const discounted = calculateStarforceTargetCost({
    level: 200, currentStar: 15, targetStar: 17, outcomes, restoreResources: {},
    conditions: { discountRate: 0.1, discountUntilStar: 17 },
  });
  assert.equal(discounted.expectedMeso, Math.round(starforceAttemptCost(200, 15) * 0.9) + Math.round(starforceAttemptCost(200, 16) * 0.9));
  assert.ok(discounted.expectedMeso < base.expectedMeso);
});

test('safeguard adds 200% of the undiscounted base cost and prevents destruction at 15 through 17 stars', () => {
  const baseCost = starforceAttemptCost(200, 16);
  const conditions = {
    discountRate: 0.15,
    discountUntilStar: 17,
    safeguard: true,
    safeguardStars: [15, 16, 17],
    safeguardSurchargeRate: 2,
  };
  const result = calculateNextStarCost({
    level: 200,
    star: 16,
    outcome: { successProbability: 0.315, maintainProbability: 0.6645, destroyProbability: 0.0205 },
    restoreResources: resources,
    conditions,
  });

  const expectedAttemptCost = Math.round(baseCost * 0.85) + Math.round(baseCost * 2);
  assert.equal(result.attemptCost, expectedAttemptCost);
  assert.equal(result.recovery, null);
  assert.equal(result.expectedMesoWithOwnedRecoveryItems, Math.round(expectedAttemptCost / 0.315));
  assert.equal(result.expectedRecoveryCopies, 0);
});

test('safeguard is ignored outside its eligible star range', () => {
  const conditions = {
    safeguard: true,
    safeguardStars: [15, 16, 17],
    safeguardSurchargeRate: 2,
  };
  const result = calculateNextStarCost({
    level: 200,
    star: 18,
    outcome,
    restoreResources: resources,
    conditions,
  });

  assert.equal(result.attemptCost, starforceAttemptCost(200, 18));
  assert.equal(result.expectedRecoveryCopies, outcome.destroyProbability / outcome.successProbability);
});
