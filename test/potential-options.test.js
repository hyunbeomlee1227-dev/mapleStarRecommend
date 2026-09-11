import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createPotentialOptionsService, parsePotentialOptionsHtml, PotentialOptionsError } from '../server/potential-options.js';

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
