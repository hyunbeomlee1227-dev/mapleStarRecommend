import { z } from 'zod';
import { supportsStarforce } from '../shared/equipment.js';

const itemSchema = z.object({
  item_name: z.string().min(1).max(200),
  item_equipment_slot: z.string().min(1).max(100),
  item_equipment_part: z.string().min(1).max(100).nullable().optional(),
  baseEquipmentLevel: z.number().int().min(1).max(300).nullable().optional(),
  starforce: z.union([z.string().max(10), z.number().finite()]).nullable().optional(),
  special_ring_level: z.union([z.string().max(10), z.number().finite()]).nullable().optional(),
  potential_option_grade: z.string().max(30).nullable().optional(),
  additional_potential_option_grade: z.string().max(30).nullable().optional(),
});

export const recommendationRequestSchema = z.object({
  goalId: z.string().min(1).max(100),
  mode: z.enum(['all', 'budget']),
  budgetMesos: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  combat: z.object({
    readiness: z.string().max(50),
    message: z.string().max(500).optional(),
  }).passthrough(),
  items: z.array(itemSchema).max(60),
}).superRefine((value, context) => {
  if (value.mode === 'budget' && value.budgetMesos === null) {
    context.addIssue({ code: 'custom', path: ['budgetMesos'], message: '예산 내 추천에는 예산이 필요합니다.' });
  }
});

const gradeIds = { '레어': 'rare', '에픽': 'epic', '유니크': 'unique', '레전드리': 'legendary' };

function potentialTierUpgrades(items, rules) {
  if (!rules?.capabilities?.potentialTierUpgrade?.usableForRecommendation) return [];
  return items.flatMap((item) => {
    if (!item.baseEquipmentLevel) return [];
    return [
      ['regular', item.potential_option_grade],
      ['additional', item.additional_potential_option_grade],
    ].flatMap(([potentialType, gradeLabel]) => {
      const currentGrade = gradeIds[gradeLabel];
      const tier = rules.potentialTierUpgrades[potentialType][currentGrade];
      const band = rules.potentialResetCosts[potentialType].find(({ minLevel, maxLevel }) => item.baseEquipmentLevel >= minLevel && item.baseEquipmentLevel <= maxLevel);
      if (!tier || !band) return [];
      return [{
        type: 'potential-tier-upgrade',
        potentialType,
        itemName: item.item_name,
        slot: item.item_equipment_slot,
        equipmentLevel: item.baseEquipmentLevel,
        currentGrade,
        nextGrade: tier.nextGrade,
        resetCost: band.costs[currentGrade],
        successProbability: tier.successProbability,
        guaranteeFailures: tier.guaranteeFailures,
      }];
    });
  });
}

function starforceAttemptCost(level, star) {
  if (star <= 9) return Math.round((1000 + (level ** 3 * (star + 1)) / 36) / 100) * 100;
  const divisors = { 10: 571, 11: 314, 12: 214, 13: 157, 14: 107, 17: 150, 18: 70, 19: 45, 21: 125 };
  const raw = level ** 3 * (star + 1) ** 2.7 / (divisors[star] ?? 200);
  return 1000 + Math.round(raw / 100) * 100;
}

function expectedMesoToNextStar(level, startStar, outcomes) {
  const targetStar = startStar + 1;
  if (startStar < 12) return Math.round(starforceAttemptCost(level, startStar) / outcomes[String(startStar)].successProbability);
  const coefficients = { [targetStar]: { constant: 0, reset: 0 } };
  for (let star = targetStar - 1; star >= 12; star -= 1) {
    const outcome = outcomes[String(star)];
    const next = coefficients[star + 1];
    const denominator = 1 - outcome.maintainProbability;
    coefficients[star] = {
      constant: (starforceAttemptCost(level, star) + outcome.successProbability * next.constant) / denominator,
      reset: (outcome.successProbability * next.reset + outcome.destroyProbability) / denominator,
    };
  }
  const atTwelve = coefficients[12].constant / (1 - coefficients[12].reset);
  return Math.round(coefficients[startStar].constant + coefficients[startStar].reset * atTwelve);
}

function starforceRisks(items, rules) {
  if (!rules?.starforceOutcomes || !rules.starforceCostModel) return [];
  return items.flatMap((item) => {
    if (!supportsStarforce(item)) return [];
    const currentStar = Number(item.starforce);
    const outcome = rules.starforceOutcomes[String(currentStar)];
    if (!outcome || !item.baseEquipmentLevel) return [];
    const restoreLevels = [130, 135, 140, 145, 150, 160, 200, 250];
    const canRestore = currentStar >= 15 && restoreLevels.includes(item.baseEquipmentLevel);
    const traceRecoveryStar = canRestore ? (currentStar >= 23 ? 22 : currentStar) : null;
    const intactRecoveryCopies = !canRestore ? null : traceRecoveryStar <= 18 ? 1 : traceRecoveryStar <= 20 ? 2 : traceRecoveryStar === 21 ? 3 : 4;
    return [{
      type: 'starforce-risk', itemName: item.item_name, slot: item.item_equipment_slot, currentStar,
      ...outcome,
      traceRecoveryStar,
      intactRecoveryCopies,
      attemptCost: starforceAttemptCost(item.baseEquipmentLevel, currentStar),
      expectedMesoWithoutSpares: expectedMesoToNextStar(item.baseEquipmentLevel, currentStar, rules.starforceOutcomes),
      costSource: 'mesu-live-community-model',
    }];
  });
}

function equipmentRecommendations(goal, items, equipmentTargets) {
  if (!Number.isInteger(goal?.order) || !equipmentTargets?.rules) return [];
  return equipmentTargets.rules.flatMap((rule) => {
    if (goal.order < rule.minGoalOrder || goal.order > rule.maxGoalOrder) return [];
    const matchedItems = items.filter((candidate) => rule.itemNames?.includes(candidate.item_name)
      || rule.itemNamePrefixes?.some((prefix) => candidate.item_name.startsWith(prefix)));
    return matchedItems.flatMap((item) => {
    const rawStarforce = item.starforce;
    const currentStarforce = typeof rawStarforce === 'number'
      ? rawStarforce
      : typeof rawStarforce === 'string' && /^\d{1,2}$/.test(rawStarforce) ? Number(rawStarforce) : null;
    const actions = [];
    if (rule.target.starforce != null && Number.isInteger(currentStarforce) && currentStarforce < rule.target.starforce) {
      actions.push(`스타포스 ${currentStarforce}성 -> ${rule.target.starforce}성`);
    }
    if (!actions.length) return [];
    return [{
      ruleId: rule.id,
      sourceKind: 'curated-rule',
      itemName: item.item_name,
      slot: item.item_equipment_slot,
      current: { starforce: currentStarforce },
      target: rule.target,
      actions,
      reason: rule.reason,
    }];
    });
  });
}

export function buildRecommendationPlan({ goal, mode, budgetMesos, combat, items, rules, equipmentTargets }) {
  const ruleTrace = { rulesVersion: rules?.version ?? null, rulesUpdatedAt: rules?.updatedAt ?? null };
  const coverage = {
    equipment: items.length,
    starforce: items.filter(supportsStarforce).length,
    potential: items.filter((item) => Boolean(item.potential_option_grade)).length,
    additionalPotential: items.filter((item) => Boolean(item.additional_potential_option_grade)).length,
  };
  if (!goal) return { status: 'unknown-goal', message: '지원하는 목표 보스를 선택해 주세요.', mode, budgetMesos, coverage, blockers: ['goal'], ...ruleTrace };
  if (combat.readiness !== 'snapshot-ready') {
    return { status: 'insufficient-data', message: combat.message || '보스전 비교에 필요한 능력치가 부족합니다.', mode, budgetMesos, coverage, blockers: ['combat-snapshot'], ...ruleTrace };
  }
  const blockers = rules
    ? Object.entries(rules.capabilities).filter(([, capability]) => !capability.usableForRecommendation).map(([id]) => id)
    : ['upgrade-rules', 'job-damage-model'];
  return {
    status: 'model-pending',
    message: '강화 후보 정보는 준비됐지만 비용과 성능 모델 검증 전이라 순위를 제공하지 않습니다.',
    mode,
    budgetMesos,
    coverage,
    blockers,
    equipmentRecommendations: equipmentRecommendations(goal, items, equipmentTargets),
    equipmentTargetTrace: {
      version: equipmentTargets?.version ?? null,
      updatedAt: equipmentTargets?.updatedAt ?? null,
      sourceKind: 'curated-rule',
      budgetApplied: false,
    },
    supportedCalculations: {
      potentialTierUpgrades: potentialTierUpgrades(items, rules),
      starforceRisks: starforceRisks(items, rules),
    },
    ...ruleTrace,
    goal: { id: goal.id, boss: goal.boss, difficulty: goal.difficulty },
  };
}
