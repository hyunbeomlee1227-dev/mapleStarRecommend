import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createStarforceEventService } from '../server/starforce-events.js';

const listHtml = `
  <div class="event_board"><ul>
    <li><dd class="data"><a href="/News/Event/Ongoing/2001"><em class="event_listMt">썬데이 메이플</em></a></dd><dd class="date"><p>2026.09.20 ~ 2026.09.20</p></dd></li>
    <li><dd class="data"><a href="/News/Event/Ongoing/2002"><em class="event_listMt">스타포스 강화 지원</em></a></dd><dd class="date"><p>2026.09.17 ~ 2026.09.24</p></dd></li>
    <li><dd class="data"><a href="/News/Event/Ongoing/2003"><em class="event_listMt">일반 성장 이벤트</em></a></dd><dd class="date"><p>2026.09.17 ~ 2026.09.24</p></dd></li>
  </ul></div>`;

const htmlResponse = (body) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('official event discovery verifies Sunday detail text and caches by KST date', async () => {
  let currentTime = Date.parse('2026-09-20T03:00:00Z');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/News/Event')) return htmlResponse(listHtml);
    if (String(url).endsWith('/2001')) return htmlResponse('<main>스타포스 강화 비용 할인 혜택</main>');
    if (String(url).endsWith('/2002')) return htmlResponse('<main>공식 스타포스 이벤트 상세</main>');
    throw new Error('unexpected URL');
  };
  const service = createStarforceEventService({ fetchImpl, now: () => currentTime });

  const first = await service.getStatus();
  assert.equal(first.status, 'verification-required');
  assert.equal(first.checkedDate, '2026-09-20');
  assert.deepEqual(first.candidates.map(({ id, title, startDate, endDate }) => ({ id, title, startDate, endDate })), [
    { id: '2001', title: '썬데이 메이플', startDate: '2026-09-20', endDate: '2026-09-20' },
    { id: '2002', title: '스타포스 강화 지원', startDate: '2026-09-17', endDate: '2026-09-24' },
  ]);
  await service.getStatus();
  assert.equal(calls.length, 3);

  currentTime = Date.parse('2026-09-21T15:00:00Z');
  const nextDay = await service.getStatus();
  assert.deepEqual(nextDay.candidates.map(({ id }) => id), ['2002']);
  assert.equal(calls.length, 5);
});

test('event discovery ignores Sunday events without starforce details and fails closed', async () => {
  const noStarforce = createStarforceEventService({
    now: () => Date.parse('2026-09-20T03:00:00Z'),
    fetchImpl: async (url) => String(url).endsWith('/News/Event')
      ? htmlResponse(listHtml.replace('스타포스 강화 지원', '장비 성장 지원'))
      : htmlResponse('<main>경험치와 사냥 혜택</main>'),
  });
  assert.deepEqual(await noStarforce.getStatus(), {
    status: 'none', checkedDate: '2026-09-20', sourceUrl: 'https://maplestory.nexon.com/News/Event', candidates: [],
  });

  const unavailable = createStarforceEventService({ fetchImpl: async () => { throw new Error('offline'); } });
  const result = await unavailable.getStatus();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.candidates.length, 0);
});

test('event discovery applies its detail limit after removing inactive events', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const active = index === 5;
    const date = active ? '2026.09.20 ~ 2026.09.20' : '2026.09.01 ~ 2026.09.02';
    return `<li><dd class="data"><a href="/News/Event/Ongoing/${3000 + index}">스타포스 행사 ${index + 1}</a></dd><dd class="date">${date}</dd></li>`;
  }).join('');
  const service = createStarforceEventService({
    now: () => Date.parse('2026-09-20T03:00:00Z'),
    fetchImpl: async (url) => String(url).endsWith('/News/Event')
      ? htmlResponse(`<div class="event_board"><ul>${rows}</ul></div>`)
      : htmlResponse('<main>스타포스 강화 지원</main>'),
  });
  const result = await service.getStatus();
  assert.deepEqual(result.candidates.map(({ id }) => id), ['3005']);
});

test('event discovery fails closed when active candidates exceed the detail limit', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => `<li><dd class="data"><a href="/News/Event/Ongoing/${4000 + index}">썬데이 메이플 ${index + 1}</a></dd><dd class="date">2026.09.20 ~ 2026.09.20</dd></li>`).join('');
  let calls = 0;
  const service = createStarforceEventService({
    now: () => Date.parse('2026-09-20T03:00:00Z'),
    fetchImpl: async (url) => {
      calls += 1;
      return String(url).endsWith('/News/Event')
        ? htmlResponse(`<div class="event_board"><ul>${rows}</ul></div>`)
        : htmlResponse('<main>경험치 혜택</main>');
    },
  });
  const result = await service.getStatus();
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 6);
});

test('starforce event endpoint exposes the discovery result without applying a benefit', async () => {
  const status = {
    status: 'verification-required', checkedDate: '2026-09-20',
    sourceUrl: 'https://maplestory.nexon.com/News/Event',
    candidates: [{ id: '2001', title: '썬데이 메이플', startDate: '2026-09-20', endDate: '2026-09-20', sourceUrl: 'https://maplestory.nexon.com/News/Event/Ongoing/2001' }],
  };
  const app = createApp({
    service: { configured: false },
    starforceEvents: { getStatus: async () => status },
  });
  const response = await request(app).get('/api/rules/starforce-events');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, status);
  assert.equal(response.headers['cache-control'], 'no-store');
});
