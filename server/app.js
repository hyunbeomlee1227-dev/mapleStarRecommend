import express from 'express';
import { isIP } from 'node:net';
import { LookupError } from './nexon.js';
import { assessGoal } from './combat.js';
import { buildRecommendationPlan, recommendationRequestSchema } from './recommendation.js';
import { PotentialOptionsError, potentialLineGradesSchema, potentialOptionsQuerySchema, potentialTargetProbabilitySchema } from './potential-options.js';
import { calculatePotentialProgression } from './potential-target.js';

export function createApp({ service, potentialOptions = null, goals = { goals: [], defaultGoalId: null }, equipmentTargets = { version: null, updatedAt: null, rules: [] }, equipmentBaselines = null, rules = { version: null, updatedAt: null, capabilities: {}, potentialResetCosts: { regular: [], additional: [] }, potentialTierUpgrades: { regular: {}, additional: {} }, starforceOutcomes: {}, starforceCostModel: null, summary: { verified: 0, partial: 0, unsupported: 0, total: 0 } }, perMinute = 12, potentialOptionsPerMinute = 30, trustProxy = false, clientIpHeader = null, now = Date.now, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);
  const clients = new Map();
  const potentialClients = new Map();
  function clientKey(req) {
    const forwarded = clientIpHeader ? req.get(clientIpHeader)?.trim() : null;
    return forwarded && isIP(forwarded) ? forwarded : req.ip;
  }
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/status', (_req, res) => res.json({ configured: service.configured, recommendation: 'unverified' }));
  app.get('/api/goals', (_req, res) => res.json(goals));
  app.get('/api/rules', (_req, res) => res.json(rules));

  function reservePotentialLookup(req, res) {
    const time = now();
    for (const [ip, entry] of potentialClients) if (entry.until <= time) potentialClients.delete(ip);
    const key = clientKey(req);
    const current = potentialClients.get(key) ?? { count: 0, until: time + 60000 };
    if (current.count >= potentialOptionsPerMinute || (!potentialClients.has(key) && potentialClients.size >= 10000)) {
      res.set('Retry-After', '60');
      res.status(429).json({ code: 'RATE_LIMIT', message: '공식 잠재 옵션 조회가 많습니다. 1분 후 다시 시도해 주세요.' });
      return false;
    }
    current.count++;
    potentialClients.set(key, current);
    return true;
  }

  app.get('/api/rules/potential-options', async (req, res) => {
    const parsed = potentialOptionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_POTENTIAL_OPTION_INPUT', message: parsed.error.issues[0]?.message || '잠재 옵션 검색 조건을 확인해 주세요.' });
    if (!potentialOptions) return res.status(503).json({ code: 'POTENTIAL_OPTIONS_UNAVAILABLE', message: '공식 잠재 옵션 조회가 준비되지 않았습니다.' });
    if (!reservePotentialLookup(req, res)) return;
    try {
      const result = await potentialOptions.lookup(parsed.data);
      return res.json({ ...result, tierRules: rules.potentialTierUpgrades?.[parsed.data.type] ?? {} });
    }
    catch (error) {
      if (error instanceof PotentialOptionsError) return res.status(error.status).json({ code: error.code, message: error.message });
      return res.status(502).json({ code: 'OFFICIAL_SOURCE_UNAVAILABLE', message: '공식 잠재 옵션 정보를 불러오지 못했습니다.' });
    }
  });
  app.post('/api/rules/potential-line-grades', express.json({ limit: '8kb' }), async (req, res) => {
    const parsed = potentialLineGradesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_POTENTIAL_LINE_INPUT', message: parsed.error.issues[0]?.message || '잠재 옵션 판별 조건을 확인해 주세요.' });
    if (!potentialOptions) return res.status(503).json({ code: 'POTENTIAL_OPTIONS_UNAVAILABLE', message: '공식 잠재 옵션 조회가 준비되지 않았습니다.' });
    if (!reservePotentialLookup(req, res)) return;
    try { return res.json({ grades: await potentialOptions.classifyLines(parsed.data) }); }
    catch (error) {
      if (error instanceof PotentialOptionsError) return res.status(error.status).json({ code: error.code, message: error.message });
      return res.status(502).json({ code: 'OFFICIAL_SOURCE_UNAVAILABLE', message: '공식 잠재 옵션 정보를 불러오지 못했습니다.' });
    }
  });
  app.post('/api/rules/potential-target-probability', express.json({ limit: '16kb' }), async (req, res) => {
    const parsed = potentialTargetProbabilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_POTENTIAL_TARGET_INPUT', message: parsed.error.issues[0]?.message || '잠재 목표 조건을 확인해 주세요.' });
    if (!potentialOptions) return res.status(503).json({ code: 'POTENTIAL_OPTIONS_UNAVAILABLE', message: '공식 잠재 옵션 조회가 준비되지 않았습니다.' });
    for (const [grade, remainingAttempts] of Object.entries(parsed.data.tierRemainingAttempts)) {
      const limit = rules.potentialTierUpgrades?.[parsed.data.type]?.[grade]?.guaranteeAttempts;
      if (!Number.isInteger(limit) || remainingAttempts > limit) {
        return res.status(400).json({ code: 'INVALID_POTENTIAL_TARGET_INPUT', message: '보장까지 남은 횟수가 해당 등급의 보장 기준을 초과했습니다.' });
      }
    }
    if (!reservePotentialLookup(req, res)) return;
    const band = rules.potentialResetCosts?.[parsed.data.type]?.find(({ minLevel, maxLevel }) => parsed.data.level >= minLevel && parsed.data.level <= maxLevel);
    const resetCost = band?.costs?.[parsed.data.targetGrade];
    if (!resetCost) return res.status(503).json({ code: 'RULE_DATA_UNAVAILABLE', message: '이 장비의 잠재 재설정 비용을 확인할 수 없습니다.' });
    try {
      const result = await potentialOptions.calculateTarget(parsed.data);
      const progression = calculatePotentialProgression({
        currentGrade: parsed.data.grade,
        targetGrade: parsed.data.targetGrade,
        targetExpectedResets: result.expectedResets,
        costs: band.costs,
        tierRules: rules.potentialTierUpgrades?.[parsed.data.type],
        tierRemainingAttempts: parsed.data.tierRemainingAttempts,
      });
      return res.json({
        ...result,
        currentGrade: parsed.data.grade,
        targetGrade: parsed.data.targetGrade,
        resetCost,
        targetGradeExpectedResets: result.expectedResets,
        ...progression,
      });
    } catch (error) {
      if (error instanceof PotentialOptionsError) return res.status(error.status).json({ code: error.code, message: error.message });
      return res.status(502).json({ code: 'OFFICIAL_SOURCE_UNAVAILABLE', message: '공식 잠재 목표 확률을 계산하지 못했습니다.' });
    }
  });
  app.get('/api/character', async (req, res) => {
    const time = now();
    for (const [ip, entry] of clients) if (entry.until <= time) clients.delete(ip);
    const key = clientKey(req);
    const current = clients.get(key) ?? { count: 0, until: time + 60000 };
    if (current.count >= perMinute || (!clients.has(key) && clients.size >= 10000)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ code: 'RATE_LIMIT', message: '조회 요청이 많습니다. 1분 후 다시 시도해 주세요.' });
    }
    current.count++;
    clients.set(key, current);
    try { res.json(await service.lookup(req.query.name)); }
    catch (error) {
      const status = error instanceof LookupError ? error.status : 500;
      const code = error instanceof LookupError ? error.code : 'INTERNAL_ERROR';
      if (status >= 429) logger.warn?.('character_lookup_failed', { code, status });
      if (error instanceof LookupError) return res.status(status).json({ code, message: error.message });
      res.status(500).json({ code: 'INTERNAL_ERROR', message: '조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });
  app.post('/api/assessment', express.json({ limit: '16kb' }), (req, res) => {
    const goal = goals.goals.find((candidate) => candidate.id === req.body?.goalId);
    const snapshot = req.body?.combat;
    if (!snapshot || typeof snapshot !== 'object') return res.status(400).json({ code: 'INVALID_SNAPSHOT', message: '캐릭터를 먼저 조회해 주세요.' });
    res.json({ goalId: goal?.id ?? null, ...assessGoal(snapshot, goal) });
  });
  app.post('/api/recommendations', express.json({ limit: '64kb' }), (req, res) => {
    const parsed = recommendationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_RECOMMENDATION_INPUT', message: parsed.error.issues[0]?.message || '추천 조건을 확인해 주세요.' });
    const goal = goals.goals.find((candidate) => candidate.id === parsed.data.goalId);
    res.json(buildRecommendationPlan({ ...parsed.data, goal, rules, equipmentTargets, equipmentBaselines }));
  });
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: '지원하지 않는 요청입니다.' }));
  return app;
}
