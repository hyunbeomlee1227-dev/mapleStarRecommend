import { z } from 'zod';
import { standardStarforceSupport, supportsStandardStarforce, supportsStarforce } from '../shared/equipment.js';
import { calculateNextStarCost, calculateStarforceTargetCost, starforceOutcomeForConditions } from './starforce.js';

const itemSchema = z.object({
  item_name: z.string().min(1).max(200),
  item_equipment_slot: z.string().min(1).max(100),
  item_equipment_part: z.string().min(1).max(100).nullable().optional(),
  item_description: z.string().max(1000).nullable().optional(),
  baseEquipmentLevel: z.number().int().min(1).max(300).nullable().optional(),
  starforce: z.union([z.string().max(10), z.number().finite()]).nullable().optional(),
  special_ring_level: z.union([z.string().max(10), z.number().finite()]).nullable().optional(),
  potential_option_grade: z.string().max(30).nullable().optional(),
  additional_potential_option_grade: z.string().max(30).nullable().optional(),
  potential_option_1: z.string().max(500).nullable().optional(),
  potential_option_2: z.string().max(500).nullable().optional(),
  potential_option_3: z.string().max(500).nullable().optional(),
  additional_potential_option_1: z.string().max(500).nullable().optional(),
  additional_potential_option_2: z.string().max(500).nullable().optional(),
  additional_potential_option_3: z.string().max(500).nullable().optional(),
});
const starforceConditionsSchema = z.object({
  mvpGrade: z.enum(['none', 'silver', 'gold', 'diamond', 'red', 'black']),
  pcRoom: z.boolean(),
  safeguard: z.boolean().default(false),
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
  starforceConditions: starforceConditionsSchema.default({ mvpGrade: 'none', pcRoom: false, safeguard: false }),
  items: z.array(itemSchema).max(60),
}).superRefine((value, context) => {
  if (value.mode === 'budget' && value.budgetMesos === null) {
    context.addIssue({ code: 'custom', path: ['budgetMesos'], message: '예산 내 추천에는 예산이 필요합니다.' });
  }
});

function jobEquipmentReference(characterJob, items, equipmentBaselines) {
  if (!characterJob || equipmentBaselines?.sampling?.strategy !== 'job-stratified') return { status: 'unavailable' };
  const profile = equipmentBaselines.jobs?.[characterJob];
  const minimumSamples = Math.max(8, equipmentBaselines.sampling.samplesPerJob);
  if (!profile || profile.sampleSize < minimumSamples) return { status: 'unavailable', minimumSamples };
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

function resolveStarforceConditions(rules, selected = { mvpGrade: 'none', pcRoom: false, safeguard: false }) {
  const normalized = {
    mvpGrade: selected?.mvpGrade ?? 'none',
    pcRoom: selected?.pcRoom === true,
    safeguard: selected?.safeguard === true,
  };
  const config = rules?.starforcePermanentBenefits;
  const safeguardConfig = rules?.starforceSafeguard;
  if (!config) return { selected: normalized, calculation: undefined, discountRate: 0 };
  const discountRate = (config.mvpDiscountRates[normalized.mvpGrade] ?? 0)
    + (normalized.pcRoom ? config.pcRoomDiscountRate : 0);
  return {
    selected: normalized,
    calculation: {
      discountRate,
      discountUntilStar: config.discountUntilStar,
      safeguard: normalized.safeguard,
      safeguardStars: safeguardConfig?.eligibleStars ?? [],
      safeguardSurchargeRate: safeguardConfig?.surchargeRate ?? 0,
    },
    discountRate,
  };
}

const magicJobs = new Set([
  '아크메이지(불,독)', '아크메이지(썬,콜)', '비숍', '플레임위자드', '에반', '루미너스',
  '배틀메이지', '일리움', '라라', '키네시스', '레테',
]);
const dexJobs = new Set([
  '보우마스터', '신궁', '패스파인더', '윈드브레이커', '메르세데스', '와일드헌터',
  '메카닉', '캡틴', '엔젤릭버스터', '카인',
]);
const intJobs = magicJobs;
const lukJobs = new Set(['나이트로드', '섀도어', '듀얼블레이더', '나이트워커', '팬텀', '카데나', '칼리', '호영']);

function mainStatsForJob(job) {
  if (job === '데몬어벤져') return ['최대 HP'];
  if (job === '제논') return ['STR', 'DEX', 'LUK', '올스탯'];
  if (intJobs.has(job)) return ['INT', '올스탯'];
  if (dexJobs.has(job)) return ['DEX', '올스탯'];
  if (lukJobs.has(job)) return ['LUK', '올스탯'];
  return ['STR', '올스탯'];
}

const farmingPotentialPattern = /아이템 드롭률|메소 획득량|경험치/;

function effectivePotentialLine(line, item, job, potentialType = 'regular') {
  if (!line || farmingPotentialPattern.test(line)) return false;
  const slot = item.item_equipment_slot.replace(/\d+$/, '');
  if (['무기', '보조무기', '엠블렘'].includes(slot)) {
    const attack = magicJobs.has(job) ? '마력' : '공격력';
    return line.includes('보스 몬스터 공격 시 데미지')
      || line.includes('몬스터 방어율 무시')
      || new RegExp(`${attack}[^%]*\\+\\d+%`).test(line);
  }
  if (potentialType === 'additional') {
    const attack = magicJobs.has(job) ? '마력' : '공격력';
    if (new RegExp(`^${attack}\\s*:\\s*\\+[1-9]\\d*%?$`).test(line.trim())) return true;
    if (mainStatsForJob(job).some((stat) => new RegExp(`^캐릭터 기준 \\d+레벨 당 ${stat}\\s*:\\s*\\+[1-9]\\d*$`).test(line.trim()))) return true;
  }
  if (slot === '장갑' && /크리티컬 데미지[^%]*\+\d+%/.test(line)) return true;
  if (slot === '모자' && /스킬 재사용 대기시간.*감소/.test(line)) return true;
  return mainStatsForJob(job).some((stat) => new RegExp(`${stat}[^%]*\\+\\d+%`).test(line));
}

function potentialThreeLineRecommendations(items, characterJob) {
  return items.flatMap((item) => {
    if (item.special_ring_level) return [];
    return [
      { type: 'regular', prefix: 'potential_option', label: '윗잠' },
      { type: 'additional', prefix: 'additional_potential_option', label: '에디셔널' },
    ].flatMap(({ type, prefix, label }) => {
      const grade = item[`${prefix}_grade`];
      if (!Object.hasOwn(gradeIds, grade)) return [];
      const lines = [1, 2, 3].map((index) => item[`${prefix}_${index}`]);
      if (type === 'additional' && !lines.some((line) => line?.trim())) return [];
      const lineAssessments = lines.map((line, index) => {
        const option = line?.trim() || null;
        const status = !option ? 'missing'
          : farmingPotentialPattern.test(option) ? 'farming'
            : effectivePotentialLine(option, item, characterJob, type) ? 'effective' : 'unverified';
        return { line: index + 1, option, status };
      });
      const effectiveLines = lineAssessments.filter((line) => line.status === 'effective').length;
      const unverifiedLines = lineAssessments.filter((line) => line.status === 'unverified').length;
      const missingLines = lineAssessments.filter((line) => line.status === 'missing').length;
      if (grade === '레전드리' && effectiveLines >= 3) return [];
      const actions = [];
      if (grade !== '레전드리') actions.push(`${label} ${grade} -> 레전드리`);
      actions.push(`${type === 'additional' ? '에디셔널 ' : ''}보스전 유효 ${effectiveLines}줄 -> 3줄`);
      return [{
        ruleId: type === 'regular' ? 'boss-potential-three-lines' : 'boss-additional-potential-three-lines',
        sourceKind: 'combat-option-rule', recommendationKind: 'potential', potentialType: type,
        itemName: item.item_name, slot: item.item_equipment_slot,
        current: { potentialGrade: grade, effectiveLines },
        target: { potentialGrade: '레전드리', effectiveLines: 3 }, actions,
        lineAssessments,
        unverifiedLines,
        missingLines,
        unconfirmedLines: unverifiedLines + missingLines,
        expectedMeso: null, expectedMesoPerStar: null,
        reason: `사냥용 옵션을 제외하고 직업 주스탯과 무기류 보스전 옵션을 기준으로 판정한 ${label} 3줄 목표입니다. 비용과 최종뎀 효율은 미검증입니다.`,
      }];
    });
  });
}

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
        guaranteeAttempts: tier.guaranteeAttempts,
      }];
    });
  });
}

function starforceRisks(items, rules, starforceCalculationConditions) {
  if (!rules?.starforceOutcomes || !rules.starforceCostModel) return [];
  return items.flatMap((item) => {
    if (!supportsStandardStarforce(item)) return [];
    const currentStar = Number(item.starforce);
    const outcome = rules.starforceOutcomes[String(currentStar)];
    if (!outcome || !item.baseEquipmentLevel) return [];
    const cost = calculateNextStarCost({
      level: item.baseEquipmentLevel,
      star: currentStar,
      outcome,
      outcomes: rules.starforceOutcomes,
      restoreResources: rules.starforceRestoreResources?.levels,
      conditions: starforceCalculationConditions,
    });
    const effectiveOutcome = starforceOutcomeForConditions(currentStar, outcome, starforceCalculationConditions);
    return [{
      type: 'starforce-risk', itemName: item.item_name, slot: item.item_equipment_slot, currentStar,
      ...effectiveOutcome,
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

function equipmentRecommendations(goal, items, equipmentTargets, rules, characterJob, starforceCalculationConditions) {
  const potential = potentialThreeLineRecommendations(items, characterJob);
  if (!Number.isInteger(goal?.order) || !equipmentTargets?.rules) return potential;
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
      if (rule.target.starforce != null && !supportsStandardStarforce(item)) return [];
      const rawStarforce = item.starforce;
      const currentStarforce = typeof rawStarforce === 'number'
        ? rawStarforce
        : typeof rawStarforce === 'string' && /^\d{1,2}$/.test(rawStarforce) ? Number(rawStarforce) : null;
      const actions = [];
      if (rule.target.starforce != null && Number.isInteger(currentStarforce) && currentStarforce < rule.target.starforce) {
        actions.push(`스타포스 ${currentStarforce}성 -> ${rule.target.starforce}성`);
      }
      if (!actions.length) return [];
      const cost = item.baseEquipmentLevel && rule.target.starforce != null
        ? calculateStarforceTargetCost({
          level: item.baseEquipmentLevel, currentStar: currentStarforce, targetStar: rule.target.starforce,
          outcomes: rules?.starforceOutcomes, restoreResources: rules?.starforceRestoreResources?.levels,
          conditions: starforceCalculationConditions,
        })
        : null;
      return [{
        ruleId: rule.id,
        sourceKind: 'curated-rule',
        recommendationKind: 'starforce',
        itemName: item.item_name,
        slot: item.item_equipment_slot,
        current: { starforce: currentStarforce },
        target: rule.target,
        actions,
        expectedMeso: cost?.expectedMeso ?? null,
        expectedRecoveryCopies: cost?.expectedRecoveryCopies ?? null,
        expectedMesoPerStar: cost?.expectedMesoPerStar ?? null,
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
  const starforce = [...bestByItem.values()].sort((left, right) => {
    if (left.expectedMesoPerStar === null && right.expectedMesoPerStar === null) return 0;
    if (left.expectedMesoPerStar === null) return 1;
    if (right.expectedMesoPerStar === null) return -1;
    return left.expectedMesoPerStar - right.expectedMesoPerStar;
  });
  return [...starforce, ...potential];
}

function unsupportedStarforceItems(items) {
  return items.flatMap((item) => {
    if (!supportsStarforce(item)) return [];
    const support = standardStarforceSupport(item);
    if (support.supported) return [];
    return [{
      itemName: item.item_name,
      slot: item.item_equipment_slot,
      currentStar: Number(item.starforce),
      code: support.code,
      message: support.message,
    }];
  });
}

export function buildRecommendationPlan({ goal, mode, budgetMesos, combat, characterJob, starforceConditions, items, rules, equipmentTargets, equipmentBaselines }) {
  const ruleTrace = { rulesVersion: rules?.version ?? null, rulesUpdatedAt: rules?.updatedAt ?? null };
  const unsupportedItems = unsupportedStarforceItems(items);
  const supportStatus = { supportedCalculations: { unsupportedStarforceItems: unsupportedItems } };
  const coverage = {
    equipment: items.length,
    starforce: items.filter(supportsStandardStarforce).length,
    potential: items.filter((item) => Boolean(item.potential_option_grade)).length,
    additionalPotential: items.filter((item) => Boolean(item.additional_potential_option_grade)).length,
  };
  const equipmentReference = jobEquipmentReference(characterJob, items, equipmentBaselines);
  const resolvedStarforceConditions = resolveStarforceConditions(rules, starforceConditions);
  if (!goal) return { status: 'unknown-goal', message: '지원하는 목표 보스를 선택해 주세요.', mode, budgetMesos, coverage, blockers: ['goal'], jobEquipmentReference: equipmentReference, ...supportStatus, ...ruleTrace };
  if (combat.readiness !== 'snapshot-ready') {
    return { status: 'insufficient-data', message: combat.message || '보스전 비교에 필요한 능력치가 부족합니다.', mode, budgetMesos, coverage, blockers: ['combat-snapshot'], jobEquipmentReference: equipmentReference, ...supportStatus, ...ruleTrace };
  }
  const blockers = rules
    ? Object.entries(rules.capabilities).filter(([, capability]) => !capability.usableForRecommendation).map(([id]) => id)
    : ['upgrade-rules', 'job-damage-model'];
  const allRecommendations = equipmentRecommendations(goal, items, equipmentTargets, rules, characterJob, resolvedStarforceConditions.calculation);
  let remainingBudget = budgetMesos;
  let unknownCostCandidates = 0;
  let overBudgetCandidates = 0;
  const selectedRecommendations = mode === 'budget'
    ? allRecommendations.filter((candidate) => {
      if (candidate.expectedMeso === null) {
        unknownCostCandidates += 1;
        return false;
      }
      if (candidate.expectedMeso > remainingBudget) {
        overBudgetCandidates += 1;
        return false;
      }
      remainingBudget -= candidate.expectedMeso;
      return true;
    })
    : allRecommendations;
  return {
    status: 'model-pending',
    message: '스타포스는 목표 별 1개당 기대 메소가 낮은 순서입니다. 최종뎀 효율은 아직 반영하지 않습니다.',
    mode,
    budgetMesos,
    coverage,
    blockers,
    equipmentRecommendations: selectedRecommendations,
    equipmentTargetTrace: {
      version: equipmentTargets?.version ?? null,
      updatedAt: equipmentTargets?.updatedAt ?? null,
      sourceKind: 'curated-rule',
      budgetApplied: mode === 'budget',
      budgetRemaining: mode === 'budget' ? remainingBudget : null,
      budgetSummary: mode === 'budget' ? {
        totalCandidates: allRecommendations.length,
        selectedCandidates: selectedRecommendations.length,
        unknownCostCandidates,
        overBudgetCandidates,
        expectedSpend: budgetMesos - remainingBudget,
        successGuaranteed: false,
      } : null,
      starforceConditions: resolvedStarforceConditions.selected,
      starforceDiscountRate: resolvedStarforceConditions.discountRate,
    },
    jobEquipmentReference: equipmentReference,
    supportedCalculations: {
      potentialTierUpgrades: potentialTierUpgrades(items, rules),
      starforceRisks: starforceRisks(items, rules, resolvedStarforceConditions.calculation),
      unsupportedStarforceItems: unsupportedItems,
    },
    ...ruleTrace,
    goal: { id: goal.id, boss: goal.boss, difficulty: goal.difficulty },
  };
}
