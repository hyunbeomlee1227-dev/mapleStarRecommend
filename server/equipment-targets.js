import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const targetSchema = z.object({
  starforce: z.number().int().min(0).max(30).optional(),
}).refine((target) => Object.keys(target).length > 0, '장비 목표에는 강화 조건이 하나 이상 필요합니다.');

const ruleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  itemNames: z.array(z.string().min(1).max(200)).min(1).optional(),
  itemNamePrefixes: z.array(z.string().min(1).max(100)).min(1).optional(),
  slots: z.array(z.string().min(1).max(100)).min(1).optional(),
  minEquipmentLevel: z.number().int().min(0).max(300).optional(),
  maxEquipmentLevel: z.number().int().min(0).max(300).optional(),
  minGoalOrder: z.number().int().nonnegative(),
  maxGoalOrder: z.number().int().nonnegative(),
  target: targetSchema,
  reason: z.string().min(1).max(500),
}).refine((rule) => rule.itemNames?.length || rule.itemNamePrefixes?.length || rule.slots?.length, {
  path: ['itemNames'],
  message: '장비 목표에는 이름, 장비군 접두어 또는 슬롯이 필요합니다.',
}).refine((rule) => rule.minGoalOrder <= rule.maxGoalOrder, {
  path: ['maxGoalOrder'],
  message: '장비 목표의 보스 범위가 올바르지 않습니다.',
}).refine((rule) => rule.maxEquipmentLevel == null || rule.minEquipmentLevel == null || rule.minEquipmentLevel <= rule.maxEquipmentLevel, {
  path: ['maxEquipmentLevel'],
  message: '장비 목표의 레벨 범위가 올바르지 않습니다.',
});

const fileSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().date(),
  rules: z.array(ruleSchema),
});

export async function loadEquipmentTargets(fileUrl = new URL('../data/equipment-targets.json', import.meta.url)) {
  return fileSchema.parse(JSON.parse(await readFile(fileUrl, 'utf8')));
}
