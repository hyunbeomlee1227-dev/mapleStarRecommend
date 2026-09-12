export function starforceAttemptCost(level, star) {
  if (star <= 9) return Math.round((1000 + (level ** 3 * (star + 1)) / 36) / 100) * 100;
  const divisors = { 10: 571, 11: 314, 12: 214, 13: 157, 14: 107, 17: 150, 18: 70, 19: 45, 21: 125 };
  const raw = level ** 3 * (star + 1) ** 2.7 / (divisors[star] ?? 200);
  return 1000 + Math.round(raw / 100) * 100;
}

export function calculateNextStarCost({ level, star, outcome, restoreResources }) {
  const attemptCost = starforceAttemptCost(level, star);
  if (outcome.destroyProbability === 0) {
    return {
      attemptCost,
      recovery: null,
      expectedMesoWithOwnedRecoveryItems: Math.round(attemptCost / outcome.successProbability),
      expectedRecoveryCopies: 0,
    };
  }

  const targetStar = star > 22 ? 22 : star;
  const resource = restoreResources?.[String(level)]?.[String(targetStar)];
  if (!resource) {
    return {
      attemptCost,
      recovery: null,
      expectedMesoWithOwnedRecoveryItems: null,
      expectedRecoveryCopies: null,
    };
  }

  return {
    attemptCost,
    recovery: { targetStar, ...resource },
    expectedMesoWithOwnedRecoveryItems: star > 22 ? null : Math.round(
      (attemptCost + outcome.destroyProbability * resource.restoreMeso) / outcome.successProbability,
    ),
    expectedRecoveryCopies: star > 22 ? null : outcome.destroyProbability * resource.requiredCopies / outcome.successProbability,
  };
}
