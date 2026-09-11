import express from 'express';
import { LookupError } from './nexon.js';
import { assessGoal } from './combat.js';
import { buildRecommendationPlan, recommendationRequestSchema } from './recommendation.js';
import { PotentialOptionsError, potentialOptionsQuerySchema } from './potential-options.js';

export function createApp({ service, potentialOptions = null, goals = { goals: [], defaultGoalId: null }, equipmentTargets = { version: null, updatedAt: null, rules: [] }, rules = { version: null, updatedAt: null, capabilities: {}, potentialResetCosts: { regular: [], additional: [] }, potentialTierUpgrades: { regular: {}, additional: {} }, starforceOutcomes: {}, starforceCostModel: null, summary: { verified: 0, partial: 0, unsupported: 0, total: 0 } }, perMinute = 12, potentialOptionsPerMinute = 30, now = Date.now }) {
  const app = express();
  app.disable('x-powered-by');
  const clients = new Map();
  const potentialClients = new Map();
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/status', (_req, res) => res.json({ configured: service.configured, recommendation: 'unverified' }));
  app.get('/api/goals', (_req, res) => res.json(goals));
  app.get('/api/rules', (_req, res) => res.json(rules));
  app.get('/api/rules/potential-options', async (req, res) => {
    const parsed = potentialOptionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_POTENTIAL_OPTION_INPUT', message: parsed.error.issues[0]?.message || '잠재 옵션 검색 조건을 확인해 주세요.' });
    if (!potentialOptions) return res.status(503).json({ code: 'POTENTIAL_OPTIONS_UNAVAILABLE', message: '공식 잠재 옵션 조회가 준비되지 않았습니다.' });
    const time = now();
    for (const [ip, entry] of potentialClients) if (entry.until <= time) potentialClients.delete(ip);
    const current = potentialClients.get(req.ip) ?? { count: 0, until: time + 60000 };
    if (current.count >= potentialOptionsPerMinute || (!potentialClients.has(req.ip) && potentialClients.size >= 10000)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ code: 'RATE_LIMIT', message: '공식 잠재 옵션 조회가 많습니다. 1분 후 다시 시도해 주세요.' });
    }
    current.count++;
    potentialClients.set(req.ip, current);
    try { return res.json(await potentialOptions.lookup(parsed.data)); }
    catch (error) {
      if (error instanceof PotentialOptionsError) return res.status(error.status).json({ code: error.code, message: error.message });
      return res.status(502).json({ code: 'OFFICIAL_SOURCE_UNAVAILABLE', message: '공식 잠재 옵션 정보를 불러오지 못했습니다.' });
    }
  });
  app.get('/api/character', async (req, res) => {
    const time = now();
    for (const [ip, entry] of clients) if (entry.until <= time) clients.delete(ip);
    const key = req.ip;
    const current = clients.get(key) ?? { count: 0, until: time + 60000 };
    if (current.count >= perMinute || (!clients.has(key) && clients.size >= 10000)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ code: 'RATE_LIMIT', message: '조회 요청이 많습니다. 1분 후 다시 시도해 주세요.' });
    }
    current.count++;
    clients.set(key, current);
    try { res.json(await service.lookup(req.query.name)); }
    catch (error) {
      if (error instanceof LookupError) return res.status(error.status).json({ code: error.code, message: error.message });
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
    res.json(buildRecommendationPlan({ ...parsed.data, goal, rules, equipmentTargets }));
  });
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: '지원하지 않는 요청입니다.' }));
  return app;
}
