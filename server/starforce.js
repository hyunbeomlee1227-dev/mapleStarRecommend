function baseStarforceAttemptCost(level, star) {
  let baseCost;
  if (star <= 9) baseCost = Math.round((1000 + (level ** 3 * (star + 1)) / 36) / 100) * 100;
  else {
    const divisors = { 10: 571, 11: 314, 12: 214, 13: 157, 14: 107, 17: 150, 18: 70, 19: 45, 21: 125 };
    const raw = level ** 3 * (star + 1) ** 2.7 / (divisors[star] ?? 200);
    baseCost = 1000 + Math.round(raw / 100) * 100;
  }
  return baseCost;
}

function safeguardApplies(star, conditions = {}) {
  return conditions.safeguard === true && conditions.safeguardStars?.includes(star);
}

export function starforceAttemptCost(level, star, conditions = {}) {
  const baseCost = baseStarforceAttemptCost(level, star);
  const discountRate = Math.min(1, Math.max(0, Number(conditions.discountRate) || 0));
  const discountUntilStar = Number(conditions.discountUntilStar) || 0;
  const discountedCost = star < discountUntilStar ? Math.round(baseCost * (1 - discountRate)) : baseCost;
  const safeguardSurcharge = safeguardApplies(star, conditions)
    ? Math.round(baseCost * (Number(conditions.safeguardSurchargeRate) || 0))
    : 0;
  return discountedCost + safeguardSurcharge;
}

export function starforceOutcomeForConditions(star, outcome, conditions = {}) {
  if (!safeguardApplies(star, conditions)) return outcome;
  return {
    successProbability: outcome.successProbability,
    maintainProbability: 1 - outcome.successProbability,
    destroyProbability: 0,
  };
}

function calculateRecoveryJourney({ level, star, outcomes, resource, conditions }) {
  let nextMeso = { constant: 0, restart: 0 };
  let nextCopies = { constant: 0, restart: 0 };
  let startingMeso;
  let startingCopies;

  for (let currentStar = star; currentStar >= 22; currentStar -= 1) {
    const currentOutcome = outcomes?.[String(currentStar)];
    if (!currentOutcome) return null;
    const retryProbability = 1 - currentOutcome.maintainProbability;
    const meso = {
      constant: (
        starforceAttemptCost(level, currentStar, conditions)
        + currentOutcome.successProbability * nextMeso.constant
        + currentOutcome.destroyProbability * resource.restoreMeso
      ) / retryProbability,
      restart: (
        currentOutcome.successProbability * nextMeso.restart
        + currentOutcome.destroyProbability
      ) / retryProbability,
    };
    const copies = {
      constant: (
        currentOutcome.successProbability * nextCopies.constant
        + currentOutcome.destroyProbability * resource.requiredCopies
      ) / retryProbability,
      restart: (
        currentOutcome.successProbability * nextCopies.restart
        + currentOutcome.destroyProbability
      ) / retryProbability,
    };
    if (currentStar === star) {
      startingMeso = meso;
      startingCopies = copies;
    }
    nextMeso = meso;
    nextCopies = copies;
  }

  const mesoFrom22 = nextMeso.constant / (1 - nextMeso.restart);
  const copiesFrom22 = nextCopies.constant / (1 - nextCopies.restart);
  return {
    expectedMeso: startingMeso.constant + startingMeso.restart * mesoFrom22,
    expectedCopies: startingCopies.constant + startingCopies.restart * copiesFrom22,
  };
}

export function calculateNextStarCost({ level, star, outcome, outcomes, restoreResources, conditions }) {
  const attemptCost = starforceAttemptCost(level, star, conditions);
  const effectiveOutcome = starforceOutcomeForConditions(star, outcome, conditions);
  if (effectiveOutcome.destroyProbability === 0) {
    return {
      attemptCost,
      recovery: null,
      expectedMesoWithOwnedRecoveryItems: Math.round(attemptCost / effectiveOutcome.successProbability),
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

  if (star > 22) {
    const journey = calculateRecoveryJourney({ level, star, outcomes, resource, conditions });
    return {
      attemptCost,
      recovery: { targetStar, ...resource },
      expectedMesoWithOwnedRecoveryItems: journey ? Math.round(journey.expectedMeso) : null,
      expectedRecoveryCopies: journey?.expectedCopies ?? null,
    };
  }

  return {
    attemptCost,
    recovery: { targetStar, ...resource },
    expectedMesoWithOwnedRecoveryItems: Math.round(
      (attemptCost + effectiveOutcome.destroyProbability * resource.restoreMeso) / effectiveOutcome.successProbability,
    ),
    expectedRecoveryCopies: effectiveOutcome.destroyProbability * resource.requiredCopies / effectiveOutcome.successProbability,
  };
}

export function calculateStarforceTargetCost({ level, currentStar, targetStar, outcomes, restoreResources, conditions }) {
  if (!Number.isInteger(currentStar) || !Number.isInteger(targetStar) || targetStar <= currentStar) return null;
  let expectedMeso = 0;
  let expectedRecoveryCopies = 0;
  for (let star = currentStar; star < targetStar; star += 1) {
    const outcome = outcomes?.[String(star)];
    if (!outcome) return null;
    const step = calculateNextStarCost({ level, star, outcome, outcomes, restoreResources, conditions });
    if (step.expectedMesoWithOwnedRecoveryItems === null || step.expectedRecoveryCopies === null) return null;
    expectedMeso += step.expectedMesoWithOwnedRecoveryItems;
    expectedRecoveryCopies += step.expectedRecoveryCopies;
  }
  const starsGained = targetStar - currentStar;
  return {
    expectedMeso: Math.round(expectedMeso),
    expectedRecoveryCopies,
    starsGained,
    expectedMesoPerStar: Math.round(expectedMeso / starsGained),
  };
}
