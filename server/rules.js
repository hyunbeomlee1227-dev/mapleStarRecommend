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
const fileSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.iso.date(),
  capabilities: z.record(z.string(), capabilitySchema),
  potentialResetCosts: z.object({
    regular: z.array(bandSchema).min(1),
    additional: z.array(bandSchema).min(1),
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
