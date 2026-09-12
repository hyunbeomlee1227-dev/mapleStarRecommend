import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePotentialTargetProbability } from '../server/potential-target.js';

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
