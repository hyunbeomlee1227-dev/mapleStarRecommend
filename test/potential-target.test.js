import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePotentialProgression, calculatePotentialTargetProbability, expectedAttemptsWithGuarantee } from '../server/potential-target.js';

const usefulSkill = '<쓸만한 윈드 부스터> 스킬 사용 가능';
const stat = 'STR +12%';

test('target probability renormalizes later lines after a max-one option appears', () => {
  const line = [
    { option: usefulSkill, probability: 0.5 },
    { option: stat, probability: 0.5 },
  ];

  const result = calculatePotentialTargetProbability({
    lines: [line, line, line],
    targetOptions: [stat],
    minimumMatches: 2,
  });

  assert.deepEqual(result, {
    probability: 1,
    expectedResets: 1,
    currentResultProbability: null,
    conditionedOnDifferentResult: false,
    alreadySatisfied: false,
  });
});

test('max-two options are excluded from the third line after appearing twice', () => {
  const ignoredDamage = '피격 시 10% 확률로 데미지의 20% 무시';
  const line = [
    { option: ignoredDamage, probability: 0.5 },
    { option: stat, probability: 0.5 },
  ];

  const result = calculatePotentialTargetProbability({
    lines: [line, line, line],
    targetOptions: [stat],
    minimumMatches: 1,
  });

  assert.equal(result.probability, 1);
  assert.equal(result.expectedResets, 1);
});

test('the official invincibility-after-hit wording is limited to one line', () => {
  const invincibility = '피격 후 무적시간 +3초';
  const line = [
    { option: invincibility, probability: 0.5 },
    { option: stat, probability: 0.5 },
  ];

  const result = calculatePotentialTargetProbability({
    lines: [line, line, line],
    targetOptions: [stat],
    minimumMatches: 2,
  });

  assert.equal(result.probability, 1);
});

test('an identical current result is removed before target probability is reported', () => {
  const line = [
    { option: 'A', probability: 0.5 },
    { option: 'B', probability: 0.5 },
  ];

  const excludedTarget = calculatePotentialTargetProbability({
    lines: [line, line, line], targetOptions: ['A'], minimumMatches: 3, currentOptions: ['A', 'A', 'A'],
  });
  assert.deepEqual(excludedTarget, {
    probability: 1,
    expectedResets: 0,
    currentResultProbability: 0.125,
    conditionedOnDifferentResult: true,
    alreadySatisfied: true,
  });

  const excludedFailure = calculatePotentialTargetProbability({
    lines: [line, line, line], targetOptions: ['A'], minimumMatches: 3, currentOptions: ['B', 'B', 'B'],
  });
  assert.equal(excludedFailure.probability, 1 / 7);
  assert.equal(excludedFailure.expectedResets, 7);
  assert.equal(excludedFailure.currentResultProbability, 0.125);
  assert.equal(excludedFailure.conditionedOnDifferentResult, true);
  assert.equal(excludedFailure.alreadySatisfied, false);
});

test('unknown current options are rejected instead of skipping identical-result rerolls', () => {
  const line = [{ option: stat, probability: 1 }];
  assert.throws(
    () => calculatePotentialTargetProbability({
      lines: [line, line, line], targetOptions: [stat], minimumMatches: 2, currentOptions: ['없는 옵션', stat, stat],
    }),
    /현재 잠재 결과/,
  );
});

test('potential progression includes tier-up costs without charging the arrival roll twice', () => {
  const result = calculatePotentialProgression({
    type: 'regular', currentGrade: 'unique', targetGrade: 'legendary', targetExpectedResets: 4,
    costs: { unique: 38_250_000, legendary: 45_000_000 }, tierRemainingAttempts: { unique: 8 },
    tierRules: { unique: { nextGrade: 'legendary', successProbability: 0.014, guaranteeAttempts: 107 } },
  });

  const tierExpectedResets = expectedAttemptsWithGuarantee({ successProbability: 0.014, guaranteeAttempts: 107, remainingAttempts: 8 });
  assert.equal(result.expectedResets, tierExpectedResets + 3);
  assert.equal(result.expectedMeso, Math.round(tierExpectedResets * 38_250_000 + 3 * 45_000_000));
  assert.deepEqual(result.tierSteps, [{
    currentGrade: 'unique', nextGrade: 'legendary', successProbability: 0.014,
    expectedResets: tierExpectedResets, resetCost: 38_250_000,
    expectedMeso: Math.round(tierExpectedResets * 38_250_000), guaranteeAttempts: 107, remainingAttempts: 8,
  }]);
  assert.equal(result.guaranteeApplied, true);
});

test('potential progression defaults guarantees, supports multiple tiers and skips them for the same grade', () => {
  const tierRules = {
    rare: { nextGrade: 'epic', successProbability: 0.5, guaranteeAttempts: 2 },
    epic: { nextGrade: 'unique', successProbability: 0.25, guaranteeAttempts: 4 },
  };
  const result = calculatePotentialProgression({
    currentGrade: 'rare', targetGrade: 'unique', targetExpectedResets: 4,
    costs: { rare: 10, epic: 20, unique: 30 }, tierRules,
    tierRemainingAttempts: { epic: 2 },
  });

  assert.deepEqual(result.tierSteps.map(({ currentGrade, remainingAttempts }) => ({ currentGrade, remainingAttempts })), [
    { currentGrade: 'rare', remainingAttempts: 2 },
    { currentGrade: 'epic', remainingAttempts: 2 },
  ]);
  assert.equal(result.expectedResets, 1.5 + 1.75 + 3);
  assert.equal(result.expectedMeso, 15 + 35 + 90);
  assert.equal(result.guaranteeApplied, true);

  const sameGrade = calculatePotentialProgression({
    currentGrade: 'unique', targetGrade: 'unique', targetExpectedResets: 4,
    costs: { unique: 30 }, tierRules,
  });
  assert.deepEqual(sameGrade, {
    expectedResets: 4, expectedMeso: 120, tierSteps: [], guaranteeApplied: false,
  });
});

test('potential progression rejects incomplete grade paths instead of inventing costs', () => {
  assert.throws(() => calculatePotentialProgression({
    type: 'regular', currentGrade: 'epic', targetGrade: 'legendary', targetExpectedResets: 2,
    costs: { epic: 18_000_000, legendary: 45_000_000 }, tierRules: {},
  }), /등급 상승 규칙/);
});

test('guarantee expectation caps geometric failures at the in-game remaining count', () => {
  assert.equal(expectedAttemptsWithGuarantee({ successProbability: 0.5, guaranteeAttempts: 3, remainingAttempts: 3 }), 1.75);
  assert.equal(expectedAttemptsWithGuarantee({ successProbability: 0.5, guaranteeAttempts: 3, remainingAttempts: 2 }), 1.5);
  assert.equal(expectedAttemptsWithGuarantee({ successProbability: 0.5, guaranteeAttempts: 3, remainingAttempts: 1 }), 1);
  assert.throws(
    () => expectedAttemptsWithGuarantee({ successProbability: 0.5, guaranteeAttempts: 3, remainingAttempts: 4 }),
    /남은 횟수/,
  );
});
