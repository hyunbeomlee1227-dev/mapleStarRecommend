import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const statusSchema = z.enum(['verified', 'partial', 'unsupported']);
const capabilitySchema = z.object({
  label: z.string().min(1),
  status: statusSchema,
  usableForRecommendation: z.boolean(),
  message: z.string().min(1),
  sources: z.array(z.string().url()).min(1),
}).superRefine((value, context) => {
  if (value.status !== 'verified' && value.usableForRecommendation) {
    context.addIssue({ code: 'custom', path: ['usableForRecommendation'], message: '검증되지 않은 규칙은 추천에 사용할 수 없습니다.' });
  }
});
const costsSchema = z.object({
  rare: z.number().int().positive(),
  epic: z.number().int().positive(),
  unique: z.number().int().positive(),
  legendary: z.number().int().positive(),
});
const bandSchema = z.object({
  minLevel: z.number().int().min(1),
  maxLevel: z.number().int().max(300),
  costs: costsSchema,
}).refine((band) => band.minLevel <= band.maxLevel, '레벨 구간이 올바르지 않습니다.');
const bandsSchema = z.array(bandSchema).min(1).superRefine((bands, context) => {
  if (bands[0]?.minLevel !== 1 || bands.at(-1)?.maxLevel !== 300) {
    context.addIssue({ code: 'custom', message: '비용 레벨 구간은 1부터 300까지 포함해야 합니다.' });
  }
  for (let index = 1; index < bands.length; index++) {
    if (bands[index].minLevel !== bands[index - 1].maxLevel + 1) {
      context.addIssue({ code: 'custom', path: [index], message: '비용 레벨 구간은 중복이나 공백 없이 연속되어야 합니다.' });
    }
  }
});
const tierRuleSchema = z.object({
  nextGrade: z.enum(['epic', 'unique', 'legendary']),
  successProbability: z.number().positive().max(1),
  guaranteeFailures: z.number().int().positive(),
});
const tierRulesSchema = z.object({
  rare: tierRuleSchema.extend({ nextGrade: z.literal('epic') }),
  epic: tierRuleSchema.extend({ nextGrade: z.literal('unique') }),
  unique: tierRuleSchema.extend({ nextGrade: z.literal('legendary') }),
});
const starforceOutcomeSchema = z.object({
  successProbability: z.number().min(0).max(1),
  maintainProbability: z.number().min(0).max(1),
  destroyProbability: z.number().min(0).max(1),
}).refine((outcome) => Math.abs(outcome.successProbability + outcome.maintainProbability + outcome.destroyProbability - 1) < 0.000001, '스타포스 결과 확률의 합은 1이어야 합니다.');
const fileSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.iso.date(),
  capabilities: z.record(z.string(), capabilitySchema),
  potentialResetCosts: z.object({
    regular: bandsSchema,
    additional: bandsSchema,
  }),
  potentialTierUpgrades: z.object({
    regular: tierRulesSchema,
    additional: tierRulesSchema,
  }),
  starforceOutcomes: z.record(z.string().regex(/^([0-9]|[12][0-9])$/), starforceOutcomeSchema).superRefine((outcomes, context) => {
    const expected = Array.from({ length: 30 }, (_, index) => String(index));
    if (expected.some((star) => !outcomes[star]) || Object.keys(outcomes).length !== expected.length) {
      context.addIssue({ code: 'custom', message: '스타포스 결과 확률은 0성부터 29성까지 모두 있어야 합니다.' });
    }
  }),
  starforceCostModel: z.object({
    sourceKind: z.literal('community'),
    sourceUrl: z.string().url(),
    verifiedAgainst: z.iso.date(),
    minLevel: z.literal(1),
    maxLevel: z.literal(300),
  }),
});

export async function loadUpgradeRules(fileUrl = new URL('../data/upgrade-rules.json', import.meta.url)) {
  const rules = fileSchema.parse(JSON.parse(await readFile(fileUrl, 'utf8')));
  const statuses = Object.values(rules.capabilities).map((capability) => capability.status);
  return {
    ...rules,
    summary: {
      verified: statuses.filter((status) => status === 'verified').length,
      partial: statuses.filter((status) => status === 'partial').length,
      unsupported: statuses.filter((status) => status === 'unsupported').length,
      total: statuses.length,
    },
  };
}
