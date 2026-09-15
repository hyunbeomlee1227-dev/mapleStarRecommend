import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const benchmarkSchema = z.object({ status: z.enum(['pending', 'calibrated']), version: z.string(), updatedAt: z.string(), evidence: z.array(z.string().url()) });
const goalSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  boss: z.string().min(1),
  difficulty: z.string().min(1),
  order: z.number().int().nonnegative(),
  available: z.boolean().default(true),
  source: z.string().url().optional(),
  benchmark: benchmarkSchema.optional(),
});
const fileSchema = z.object({ version: z.string(), updatedAt: z.string(), source: z.string().url(), benchmark: benchmarkSchema, goals: z.array(goalSchema) });

export async function loadGoals(fileUrl = new URL('../data/boss-goals.json', import.meta.url)) {
  const parsed = fileSchema.parse(JSON.parse(await readFile(fileUrl, 'utf8')));
  const goals = parsed.goals.filter((goal) => goal.available).map((goal) => ({
    ...goal, source: goal.source ?? parsed.source, benchmark: goal.benchmark ?? parsed.benchmark,
  })).sort((a, b) => a.order - b.order);
  return {
    version: parsed.version,
    updatedAt: parsed.updatedAt,
    goals,
    defaultGoalId: goals.at(-1)?.id ?? null,
  };
}
