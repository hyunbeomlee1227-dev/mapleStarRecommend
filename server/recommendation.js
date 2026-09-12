import { z } from 'zod';
import { supportsStarforce } from '../shared/equipment.js';
import { calculateNextStarCost } from './starforce.js';

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
  characterJob: z.string().min(1).max(100).nullable().optional(),
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

function jobEquipmentReference(characterJob, items, equipmentBaselines) {
  if (!characterJob || equipmentBaselines?.sampling?.strategy !== 'job-stratified') return { status: 'unavailable' };
  const profile = equipmentBaselines.jobs?.[characterJob];
  if (!profile || profile.sampleSize < equipmentBaselines.sampling.samplesPerJob) return { status: 'unavailable' };
  const equippedBySlot = new Map();
  for (const item of items) {
    const slot = item.item_equipment_slot.replace(/\d+$/, '');
    const equippedItems = equippedBySlot.get(slot) ?? [];
    equippedItems.push(item.item_name);
    equippedBySlot.set(slot, equippedItems);
  }
  const slots = [...equippedBySlot].flatMap(([slot, equippedItems]) => {
    const observed = profile.slots?.[slot]?.slice(0, 3) ?? [];
    return observed.length ? [{ slot, equippedItems, observed }] : [];
  });
  return {
    status: 'available', job: characterJob, sampleSize: profile.sampleSize,
    date: equipmentBaselines.date, version: equipmentBaselines.version, slots,
  };
}

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

function starforceRisks(items, rules) {
  if (!rules?.starforceOutcomes || !rules.starforceCostModel) return [];
  return items.flatMap((item) => {
    if (!supportsStarforce(item)) return [];
    const currentStar = Number(item.starforce);
    const outcome = rules.starforceOutcomes[String(currentStar)];
    if (!outcome || !item.baseEquipmentLevel) return [];
    const cost = calculateNextStarCost({
      level: item.baseEquipmentLevel,
      star: currentStar,
      outcome,
      restoreResources: rules.starforceRestoreResources?.levels,
    });
    return [{
      type: 'starforce-risk', itemName: item.item_name, slot: item.item_equipment_slot, currentStar,
      ...outcome,
      traceRecoveryStar: cost.recovery?.targetStar ?? null,
      intactRecoveryCopies: cost.recovery?.requiredCopies ?? null,
      intactRecoveryMeso: cost.recovery?.restoreMeso ?? null,
      attemptCost: cost.attemptCost,
      expectedMesoWithOwnedRecoveryItems: cost.expectedMesoWithOwnedRecoveryItems,
      expectedRecoveryCopies: cost.expectedRecoveryCopies,
      costSource: 'mesu-live-community-model',
    }];
  });
}

function equipmentRecommendations(goal, items, equipmentTargets) {
  if (!Number.isInteger(goal?.order) || !equipmentTargets?.rules) return [];
  const candidates = equipmentTargets.rules.flatMap((rule) => {
    if (goal.order < rule.minGoalOrder || goal.order > rule.maxGoalOrder) return [];
    const matchedItems = items.filter((candidate) => {
      const nameMatches = rule.itemNames?.includes(candidate.item_name)
        || rule.itemNamePrefixes?.some((prefix) => candidate.item_name.startsWith(prefix));
      const normalizedSlot = candidate.item_equipment_slot.replace(/\d+$/, '');
      const slotMatches = rule.slots?.includes(normalizedSlot);
      const levelMatches = (rule.minEquipmentLevel == null || candidate.baseEquipmentLevel >= rule.minEquipmentLevel)
        && (rule.maxEquipmentLevel == null || candidate.baseEquipmentLevel <= rule.maxEquipmentLevel);
      return (nameMatches || slotMatches) && levelMatches;
    });
    return matchedItems.flatMap((item) => {
      if (rule.target.starforce != null && !supportsStarforce(item)) return [];
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
  const bestByItem = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.slot}:${candidate.itemName}`;
    const previous = bestByItem.get(key);
    if (!previous || (candidate.target.starforce ?? -1) > (previous.target.starforce ?? -1)) bestByItem.set(key, candidate);
  }
  return [...bestByItem.values()];
}

export function buildRecommendationPlan({ goal, mode, budgetMesos, combat, characterJob, items, rules, equipmentTargets, equipmentBaselines }) {
  const ruleTrace = { rulesVersion: rules?.version ?? null, rulesUpdatedAt: rules?.updatedAt ?? null };
  const coverage = {
    equipment: items.length,
    starforce: items.filter(supportsStarforce).length,
    potential: items.filter((item) => Boolean(item.potential_option_grade)).length,
    additionalPotential: items.filter((item) => Boolean(item.additional_potential_option_grade)).length,
  };
  const equipmentReference = jobEquipmentReference(characterJob, items, equipmentBaselines);
  if (!goal) return { status: 'unknown-goal', message: '지원하는 목표 보스를 선택해 주세요.', mode, budgetMesos, coverage, blockers: ['goal'], jobEquipmentReference: equipmentReference, ...ruleTrace };
  if (combat.readiness !== 'snapshot-ready') {
    return { status: 'insufficient-data', message: combat.message || '보스전 비교에 필요한 능력치가 부족합니다.', mode, budgetMesos, coverage, blockers: ['combat-snapshot'], jobEquipmentReference: equipmentReference, ...ruleTrace };
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
    jobEquipmentReference: equipmentReference,
    supportedCalculations: {
      potentialTierUpgrades: potentialTierUpgrades(items, rules),
      starforceRisks: starforceRisks(items, rules),
    },
    ...ruleTrace,
    goal: { id: goal.id, boss: goal.boss, difficulty: goal.difficulty },
  };
}
