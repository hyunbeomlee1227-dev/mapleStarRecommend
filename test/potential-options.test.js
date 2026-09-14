import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createPotentialOptionsService, parsePotentialOptionsHtml, PotentialOptionsError } from '../server/potential-options.js';
import { loadUpgradeRules } from '../server/rules.js';

const fixture = `
  <div class="cube_option"><ul>
    <li>잠재능력 등급<span id="searchGrade">레전드리</span></li>
    <li>장비 분류<span id="searchPartsType">장갑</span></li>
    <li>장비 레벨<span id="searchReqLev">120~200</span></li>
  </ul></div>
  <table class="cube_data _1"><thead><tr><th>첫 번째 옵션</th><th>확률</th></tr></thead><tbody>
    <tr><td>크리티컬 데미지 +8%</td><td>10%</td></tr>
    <tr><td>&lt;쓸만한 윈드 부스터&gt; 스킬 사용 가능</td><td>7.5000%</td></tr>
  </tbody></table>
  <table class="cube_data _2"><tbody><tr><td>STR +9%</td><td>7.1429%</td></tr></tbody></table>
  <table class="cube_data _3"><tbody><tr><td>올스탯 +6%</td><td>6.7857%</td></tr></tbody></table>`;

const lowerGradeFixture = `
  <div class="cube_option"><ul>
    <li>잠재능력 등급<span id="searchGrade">유니크</span></li>
    <li>장비 분류<span id="searchPartsType">장갑</span></li>
    <li>장비 레벨<span id="searchReqLev">120~200</span></li>
  </ul></div>
  <table class="cube_data _1"><tbody>
    <tr><td>STR +9%</td><td>7.1429%</td></tr>
    <tr><td>DEX +9%</td><td>7.1429%</td></tr>
  </tbody></table>
  <table class="cube_data _2"><tbody><tr><td>STR +6%</td><td>7%</td></tr></tbody></table>
  <table class="cube_data _3"><tbody><tr><td>최대 HP +6%</td><td>7%</td></tr></tbody></table>`;

test('official potential option HTML is normalized into three probability lines', () => {
  assert.deepEqual(parsePotentialOptionsHtml(fixture), {
    grade: '레전드리',
    part: '장갑',
    levelBand: '120~200',
    lines: [
      [
        { option: '크리티컬 데미지 +8%', probability: 0.1 },
        { option: '<쓸만한 윈드 부스터> 스킬 사용 가능', probability: 0.075 },
      ],
      [{ option: 'STR +9%', probability: 0.071429 }],
      [{ option: '올스탯 +6%', probability: 0.067857 }],
    ],
  });
});

test('potential options endpoint validates input and returns normalized official data', async () => {
  const calls = [];
  const potentialOptions = {
    async lookup(input) {
      calls.push(input);
      return parsePotentialOptionsHtml(fixture);
    },
  };
  const service = { configured: false, lookup() {} };
  const app = createApp({ service, potentialOptions });

  const valid = await request(app).get('/api/rules/potential-options?type=regular&grade=legendary&part=gloves&level=200');
  assert.equal(valid.status, 200);
  assert.equal(valid.body.lines[0][0].option, '크리티컬 데미지 +8%');
  assert.deepEqual(calls, [{ type: 'regular', grade: 'legendary', part: 'gloves', level: 200 }]);

  const invalid = await request(app).get('/api/rules/potential-options?type=regular&grade=legendary&part=gloves&level=999');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'INVALID_POTENTIAL_OPTION_INPUT');
});

test('potential options proxy limits client requests', async () => {
  const potentialOptions = { lookup: async () => parsePotentialOptionsHtml(fixture) };
  const app = createApp({ service: { configured: false, lookup() {} }, potentialOptions, potentialOptionsPerMinute: 1, now: () => 1000 });
  const query = '/api/rules/potential-options?type=regular&grade=legendary&part=gloves&level=200';
  assert.equal((await request(app).get(query)).status, 200);
  const limited = await request(app).get(query.replace('level=200', 'level=201'));
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'RATE_LIMIT');
});

test('potential line grades compare each option with the immediately lower tier', async () => {
  const calls = [];
  const service = createPotentialOptionsService({ fetchImpl: async (_url, options) => {
    calls.push(String(options.body));
    return new Response(lowerGradeFixture);
  } });

  const grades = await service.classifyLines({
    type: 'regular', grade: 'legendary', part: 'gloves', level: 200,
    options: ['크리티컬 데미지 : +8%', 'STR : +9%', 'DEX +9%'],
  });
  assert.deepEqual(grades, ['legendary', 'unique', 'unique']);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /nGrade=3/);

  const rareGrades = await service.classifyLines({
    type: 'regular', grade: 'rare', part: 'gloves', level: 200,
    options: ['STR : +3%'],
  });
  assert.deepEqual(rareGrades, ['rare']);
  assert.equal(calls.length, 1);
});

test('potential line grade endpoint validates input and shares the proxy rate limit', async () => {
  const potentialOptions = { classifyLines: async () => ['unique', 'epic'] };
  const app = createApp({
    service: { configured: false, lookup() {} }, potentialOptions,
    potentialOptionsPerMinute: 1, now: () => 1000,
  });
  const body = { type: 'regular', grade: 'unique', part: 'gloves', level: 200, options: ['STR : +9%', 'STR : +6%'] };

  const valid = await request(app).post('/api/rules/potential-line-grades').send(body);
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body.grades, ['unique', 'epic']);

  const limited = await request(app).post('/api/rules/potential-line-grades').send(body);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'RATE_LIMIT');

  const invalidApp = createApp({ service: { configured: false, lookup() {} }, potentialOptions });
  const invalid = await request(invalidApp).post('/api/rules/potential-line-grades').send({ ...body, options: [] });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'INVALID_POTENTIAL_LINE_INPUT');
});

test('potential target endpoint combines lower-tier progression and target option costs', async () => {
  const rules = await loadUpgradeRules();
  const potentialOptions = {
    calculateTarget: async (input) => ({
      grade: '레전드리', part: '장갑', levelBand: '120~200', sourceUrl: 'https://maplestory.nexon.com/Guide/OtherProbability/cube/black',
      targetOptions: input.targetOptions, minimumMatches: input.minimumMatches,
      probability: 0.25, expectedResets: 4, currentResultProbability: 0.01, conditionedOnDifferentResult: true,
    }),
  };
  const app = createApp({ service: { configured: false, lookup() {} }, potentialOptions, rules });
  const body = {
    type: 'regular', grade: 'unique', targetGrade: 'legendary', part: 'gloves', level: 200, tierRemainingAttempts: { unique: 8 },
    targetOptions: ['크리티컬 데미지 +8%'], minimumMatches: 2,
    currentOptions: ['STR +12%', 'STR +9%', '올스탯 +6%'],
  };

  const response = await request(app).post('/api/rules/potential-target-probability').send(body);
  assert.equal(response.status, 200);
  assert.equal(response.body.probability, 0.25);
  const tierExpectedResets = (1 - (1 - 0.014) ** 8) / 0.014;
  assert.equal(response.body.expectedResets, tierExpectedResets + 3);
  assert.equal(response.body.resetCost, 45_000_000);
  assert.equal(response.body.expectedMeso, Math.round(tierExpectedResets * 38_250_000 + 3 * 45_000_000));
  assert.equal(response.body.currentGrade, 'unique');
  assert.equal(response.body.targetGrade, 'legendary');
  assert.equal(response.body.tierSteps.length, 1);
  assert.equal(response.body.guaranteeApplied, true);

  const invalid = await request(app).post('/api/rules/potential-target-probability').send({ ...body, grade: 'legendary', targetGrade: 'unique' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'INVALID_POTENTIAL_TARGET_INPUT');

  const excessiveCounter = await request(app).post('/api/rules/potential-target-probability').send({ ...body, tierRemainingAttempts: { unique: 108 } });
  assert.equal(excessiveCounter.status, 400);
  assert.equal(excessiveCounter.body.code, 'INVALID_POTENTIAL_TARGET_INPUT');
});

test('potential target lookup uses the requested target grade table', async () => {
  const calls = [];
  const service = createPotentialOptionsService({ fetchImpl: async (_url, options) => {
    calls.push(String(options.body));
    return new Response(fixture);
  } });
  const result = await service.calculateTarget({
    type: 'regular', grade: 'epic', targetGrade: 'legendary', part: 'gloves', level: 200,
    targetOptions: ['크리티컬 데미지 +8%'], minimumMatches: 1,
  });
  assert.match(calls[0], /nGrade=4/);
  assert.equal(result.targetGrade, 'legendary');
});

test('official lookup maps query codes, caches responses and reports upstream failures', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: String(options.body) });
    return new Response(fixture);
  };
  const service = createPotentialOptionsService({ fetchImpl, now: () => 1000 });
  const input = { type: 'additional', grade: 'legendary', part: 'gloves', level: 200 };
  const first = await service.lookup(input);
  const second = await service.lookup(input);

  assert.equal(first.cached, false);
  assert.deepEqual({ grade: first.grade, part: first.part, levelBand: first.levelBand }, { grade: '레전드리', part: '장갑', levelBand: '120~200' });
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList');
  assert.match(calls[0].body, /nCubeItemID=5062500/);
  assert.match(calls[0].body, /nGrade=4/);
  assert.match(calls[0].body, /nPartsType=11/);

  const failing = createPotentialOptionsService({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => failing.lookup(input), (error) => error instanceof PotentialOptionsError && error.code === 'OFFICIAL_SOURCE_UNAVAILABLE');
});

test('official lookup preserves level boundaries and coalesces identical requests', async () => {
  let calls = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const service = createPotentialOptionsService({ fetchImpl: async () => {
    calls++;
    await waiting;
    return new Response(fixture);
  } });
  const input = { type: 'regular', grade: 'rare', part: 'weapon', level: 0 };
  const lookups = [service.lookup(input), service.lookup(input)];
  release();
  const [first, second] = await Promise.all(lookups);

  assert.equal(calls, 1);
  assert.equal(first.levelBand, '0~9');
  assert.equal(second.levelBand, '0~9');
});
