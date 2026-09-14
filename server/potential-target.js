import { potentialGradeOrder } from '../shared/potential.js';

export function normalizePotentialOption(option) {
  return String(option ?? '').replace(/\s*:\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function restrictionFor(option) {
  const normalized = normalizePotentialOption(option);
  if (/^<쓸만한 .+> 스킬 사용 가능$/.test(normalized) || /피격 후.*무적시간/.test(normalized)) {
    return { group: 'max-one', limit: 1 };
  }
  if (/피격 시.*확률로.*데미지.*무시/.test(normalized) || /피격 시.*확률로.*무적/.test(normalized)) {
    return { group: 'max-two', limit: 2 };
  }
  return null;
}

function normalizedLines(lines) {
  if (!Array.isArray(lines) || lines.length !== 3 || lines.some((line) => !Array.isArray(line) || line.length === 0)) {
    throw new Error('잠재 옵션 확률표는 세 줄 모두 필요합니다.');
  }
  return lines.map((line) => {
    const total = line.reduce((sum, entry) => sum + entry.probability, 0);
    if (!Number.isFinite(total) || total <= 0) throw new Error('잠재 옵션 확률 합계를 확인할 수 없습니다.');
    return line.map((entry) => ({
      option: normalizePotentialOption(entry.option),
      probability: entry.probability / total,
      restriction: restrictionFor(entry.option),
    }));
  });
}

export function calculatePotentialTargetProbability({ lines, targetOptions, minimumMatches, currentOptions = null }) {
  const normalized = normalizedLines(lines);
  const targets = new Set(targetOptions.map(normalizePotentialOption));
  const current = currentOptions?.map(normalizePotentialOption) ?? null;
  let targetProbability = 0;
  let currentResultProbability = 0;

  function visit(lineIndex, probability, selected, restrictionCounts) {
    if (lineIndex === normalized.length) {
      const target = selected.filter((option) => targets.has(option)).length >= minimumMatches;
      if (target) targetProbability += probability;
      if (current?.every((option, index) => option === selected[index])) currentResultProbability += probability;
      return;
    }

    const allowed = normalized[lineIndex].filter(({ restriction }) => (
      !restriction || (restrictionCounts[restriction.group] ?? 0) < restriction.limit
    ));
    const allowedTotal = allowed.reduce((sum, entry) => sum + entry.probability, 0);
    for (const entry of allowed) {
      const counts = { ...restrictionCounts };
      if (entry.restriction) counts[entry.restriction.group] = (counts[entry.restriction.group] ?? 0) + 1;
      visit(
        lineIndex + 1,
        probability * entry.probability / allowedTotal,
        [...selected, entry.option],
        counts,
      );
    }
  }

  visit(0, 1, [], {});
  if (current && currentResultProbability === 0) {
    throw new Error('현재 잠재 결과를 공식 옵션표에서 찾을 수 없습니다.');
  }

  const currentIsTarget = current && current.filter((option) => targets.has(option)).length >= minimumMatches;
  if (currentIsTarget) {
    return {
      probability: 1,
      expectedResets: 0,
      currentResultProbability,
      conditionedOnDifferentResult: true,
      alreadySatisfied: true,
    };
  }
  const probability = current ? targetProbability / (1 - currentResultProbability) : targetProbability;
  const boundedProbability = Math.max(0, Math.min(1, probability));
  return {
    probability: boundedProbability,
    expectedResets: boundedProbability > 0 ? 1 / boundedProbability : null,
    currentResultProbability: current ? currentResultProbability : null,
    conditionedOnDifferentResult: Boolean(current),
    alreadySatisfied: false,
  };
}

export function expectedAttemptsWithGuarantee({ successProbability, guaranteeAttempts, remainingAttempts = guaranteeAttempts }) {
  if (!Number.isInteger(remainingAttempts) || remainingAttempts < 1 || remainingAttempts > guaranteeAttempts) {
    throw new Error('보장까지 남은 횟수가 보장 기준 범위를 벗어났습니다.');
  }
  return (1 - (1 - successProbability) ** remainingAttempts) / successProbability;
}

export function calculatePotentialProgression({ currentGrade, targetGrade, targetExpectedResets, costs, tierRules, tierRemainingAttempts = {} }) {
  const currentIndex = potentialGradeOrder.indexOf(currentGrade);
  const targetIndex = potentialGradeOrder.indexOf(targetGrade);
  if (currentIndex < 0 || targetIndex < currentIndex) throw new Error('목표 잠재 등급이 현재 등급보다 낮습니다.');
  if (targetExpectedResets === null) {
    return { expectedResets: null, expectedMeso: null, tierSteps: [], guaranteeApplied: false };
  }

  const tierSteps = [];
  let expectedResets = 0;
  let expectedMeso = 0;
  for (let index = currentIndex; index < targetIndex; index++) {
    const grade = potentialGradeOrder[index];
    const rule = tierRules?.[grade];
    const resetCost = costs?.[grade];
    if (!rule || rule.nextGrade !== potentialGradeOrder[index + 1] || !resetCost) {
      throw new Error(`${grade} 등급 상승 규칙 또는 비용을 확인할 수 없습니다.`);
    }
    const remainingAttempts = tierRemainingAttempts[grade] ?? rule.guaranteeAttempts;
    const stepResets = expectedAttemptsWithGuarantee({
      successProbability: rule.successProbability,
      guaranteeAttempts: rule.guaranteeAttempts,
      remainingAttempts,
    });
    const stepMeso = Math.round(stepResets * resetCost);
    tierSteps.push({
      currentGrade: grade,
      nextGrade: rule.nextGrade,
      successProbability: rule.successProbability,
      expectedResets: stepResets,
      resetCost,
      expectedMeso: stepMeso,
      guaranteeAttempts: rule.guaranteeAttempts,
      remainingAttempts,
    });
    expectedResets += stepResets;
    expectedMeso += stepMeso;
  }

  const targetResetCost = costs?.[targetGrade];
  if (!targetResetCost) throw new Error('목표 등급의 잠재 재설정 비용을 확인할 수 없습니다.');
  const targetResetsAfterArrival = Math.max(0, targetExpectedResets - (targetIndex > currentIndex ? 1 : 0));
  expectedResets += targetResetsAfterArrival;
  expectedMeso += Math.round(targetResetsAfterArrival * targetResetCost);
  return { expectedResets, expectedMeso, tierSteps, guaranteeApplied: true };
}
