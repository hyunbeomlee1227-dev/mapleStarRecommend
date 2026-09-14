import * as cheerio from 'cheerio';
import { z } from 'zod';
import { isPotentialGradeAtLeast, potentialGradeLabels, potentialGradeOrder } from '../shared/potential.js';
import { calculatePotentialTargetProbability, normalizePotentialOption } from './potential-target.js';

const ENDPOINT = 'https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList';
const cubeIds = { regular: '5062010', additional: '5062500' };
const grades = { rare: '1', epic: '2', unique: '3', legendary: '4' };
const lowerGrades = { legendary: 'unique', unique: 'epic', epic: 'rare' };
const parts = {
  weapon: '1', emblem: '2', secondary: '3', forceShield: '4', shield: '5', hat: '6', top: '7', overall: '8', bottom: '9', shoes: '10', gloves: '11', cape: '12', belt: '13', shoulder: '14', face: '15', eye: '16', earrings: '17', ring: '18', pendant: '19', heart: '20',
};
const partLabels = { weapon: '무기', emblem: '엠블렘', secondary: '보조무기', forceShield: '포스실드·소울링', shield: '방패', hat: '모자', top: '상의', overall: '한벌옷', bottom: '하의', shoes: '신발', gloves: '장갑', cape: '망토', belt: '벨트', shoulder: '어깨장식', face: '얼굴장식', eye: '눈장식', earrings: '귀고리', ring: '반지', pendant: '펜던트', heart: '기계심장' };

function levelBand(level) {
  if (level >= 201) return '201~250';
  if (level >= 120) return '120~200';
  if (level < 10) return '0~9';
  const lower = Math.floor(level / 10) * 10;
  return lower === level ? String(level) : `${lower + 1}~${lower + 9}`;
}

export const potentialOptionsQuerySchema = z.object({
  type: z.enum(Object.keys(cubeIds)),
  grade: z.enum(potentialGradeOrder),
  part: z.enum(Object.keys(parts)),
  level: z.coerce.number().int().min(0).max(250),
});
export const potentialLineGradesSchema = potentialOptionsQuerySchema.extend({
  options: z.array(z.string().min(1).max(500)).min(1).max(3),
});
export const potentialTargetProbabilitySchema = potentialOptionsQuerySchema.extend({
  targetGrade: z.enum(potentialGradeOrder).default('legendary'),
  targetOptions: z.array(z.string().min(1).max(500)).min(1).max(30)
    .refine((options) => new Set(options.map(normalizePotentialOption)).size === options.length, '목표 옵션은 중복해서 선택할 수 없습니다.'),
  minimumMatches: z.number().int().min(1).max(3),
  currentOptions: z.array(z.string().min(1).max(500)).length(3).optional(),
}).superRefine((value, context) => {
  if (!isPotentialGradeAtLeast(value.targetGrade, value.grade)) {
    context.addIssue({ code: 'custom', path: ['targetGrade'], message: '목표 잠재 등급은 현재 등급보다 낮을 수 없습니다.' });
  }
});

export class PotentialOptionsError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function parsePotentialOptionsHtml(html) {
  const $ = cheerio.load(html);
  const metadata = (id) => $(id).first().text().trim();
  const lines = [1, 2, 3].map((line) => $(`table.cube_data._${line} tbody tr`).map((_index, row) => {
    const cells = $(row).find('td');
    const option = cells.eq(0).text().replace(/\s+/g, ' ').trim();
    const probabilityText = cells.eq(-1).text().trim();
    const probability = Number.parseFloat(probabilityText.replace('%', '')) / 100;
    return option && Number.isFinite(probability) ? { option, probability } : null;
  }).get().filter(Boolean));

  if (lines.some((line) => line.length === 0)) {
    throw new PotentialOptionsError('INVALID_OFFICIAL_RESPONSE', '공식 잠재 옵션 표의 형식을 확인할 수 없습니다.');
  }
  return {
    grade: metadata('#searchGrade'),
    part: metadata('#searchPartsType'),
    levelBand: metadata('#searchReqLev'),
    lines,
  };
}

export function createPotentialOptionsService({ fetchImpl = fetch, now = Date.now, cacheMs = 60 * 60 * 1000 } = {}) {
  const cache = new Map();
  const inFlight = new Map();

  async function load(input) {
    const body = new URLSearchParams({
      nCubeItemID: cubeIds[input.type],
      nGrade: grades[input.grade],
      nPartsType: parts[input.part],
      nReqLev: String(input.level),
    });
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Referer: input.type === 'regular'
            ? 'https://maplestory.nexon.com/Guide/OtherProbability/cube/black'
            : 'https://maplestory.nexon.com/Guide/OtherProbability/cube/addi',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new PotentialOptionsError('OFFICIAL_SOURCE_UNAVAILABLE', '공식 잠재 옵션 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!response.ok) throw new PotentialOptionsError('OFFICIAL_SOURCE_UNAVAILABLE', '공식 잠재 옵션 정보 제공처가 응답하지 않습니다.');
    const html = await response.text();
    if (html.length > 512000) throw new PotentialOptionsError('INVALID_OFFICIAL_RESPONSE', '공식 잠재 옵션 응답이 허용 크기를 초과했습니다.');
    return { ...parsePotentialOptionsHtml(html), grade: potentialGradeLabels[input.grade], part: partLabels[input.part], levelBand: levelBand(input.level), sourceUrl: input.type === 'regular'
      ? 'https://maplestory.nexon.com/Guide/OtherProbability/cube/black'
      : 'https://maplestory.nexon.com/Guide/OtherProbability/cube/addi', cached: false };
  }

  async function lookup(input) {
    const key = `${input.type}:${input.grade}:${input.part}:${input.level}`;
    const cached = cache.get(key);
    if (cached && now() - cached.savedAt < cacheMs) return { ...cached.value, cached: true };
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = load(input).then((value) => {
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value, savedAt: now() });
      return value;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  async function classifyLines(input) {
    if (!lowerGrades[input.grade]) return input.options.map(() => input.grade);
    const lowerGrade = lowerGrades[input.grade];
    const lower = await lookup({ type: input.type, grade: lowerGrade, part: input.part, level: input.level });
    const lowerOptions = new Set((lower.lines[0] ?? []).map(({ option }) => normalizePotentialOption(option)));
    return input.options.map((option) => lowerOptions.has(normalizePotentialOption(option)) ? lowerGrade : input.grade);
  }

  async function calculateTarget(input) {
    const targetGrade = input.targetGrade ?? input.grade;
    const table = await lookup({ ...input, grade: targetGrade });
    let calculation;
    try {
      calculation = calculatePotentialTargetProbability({
        lines: table.lines,
        targetOptions: input.targetOptions,
        minimumMatches: input.minimumMatches,
        currentOptions: targetGrade === input.grade ? input.currentOptions : null,
      });
    } catch (error) {
      throw new PotentialOptionsError('INVALID_CURRENT_POTENTIAL', error.message, 422);
    }
    const { lines: _lines, cached: _cached, ...metadata } = table;
    return { ...metadata, targetGrade, targetOptions: input.targetOptions, minimumMatches: input.minimumMatches, ...calculation };
  }

  return { lookup, classifyLines, calculateTarget };
}
