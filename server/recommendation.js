import { z } from 'zod';

const itemSchema = z.object({
  item_name: z.string().min(1).max(200),
  item_equipment_slot: z.string().min(1).max(100),
  starforce: z.union([z.string().max(10), z.number().finite()]).nullable().optional(),
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

function readableStarforce(value) {
  if (value === null || value === undefined || value === '') return false;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 30;
}

export function buildRecommendationPlan({ goal, mode, budgetMesos, combat, items, rules }) {
  const coverage = {
    equipment: items.length,
    starforce: items.filter((item) => readableStarforce(item.starforce)).length,
    potential: items.filter((item) => Boolean(item.potential_option_grade)).length,
    additionalPotential: items.filter((item) => Boolean(item.additional_potential_option_grade)).length,
  };
  if (!goal) return { status: 'unknown-goal', message: '지원하는 목표 보스를 선택해 주세요.', mode, budgetMesos, coverage, blockers: ['goal'] };
  if (combat.readiness !== 'snapshot-ready') {
    return { status: 'insufficient-data', message: combat.message || '보스전 비교에 필요한 능력치가 부족합니다.', mode, budgetMesos, coverage, blockers: ['combat-snapshot'] };
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
    rulesVersion: rules?.version ?? null,
    goal: { id: goal.id, boss: goal.boss, difficulty: goal.difficulty },
  };
}
