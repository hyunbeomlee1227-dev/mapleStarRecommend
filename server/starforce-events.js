import * as cheerio from 'cheerio';

export const STARFORCE_EVENT_SOURCE_URL = 'https://maplestory.nexon.com/News/Event';
const SOURCE_ORIGIN = 'https://maplestory.nexon.com';
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_CANDIDATES = 5;
const EVENT_PATH = /^\/News\/Event\/(?:Ongoing\/)?(\d+)(?:[/?#]|$)/i;
const EVENT_TITLE = /스타포스|썬데이/;
const STARFORCE_DETAIL = /스타포스/;
const DATE_RANGE = /(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/;

function kstDate(time) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(time));
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isoDate(parts) {
  return `${parts[1]}-${parts[2]}-${parts[3]}`;
}

async function fetchHtml(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Official event source returned ${response.status}`);
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.toLowerCase().includes('text/html')) throw new Error('Official event source did not return HTML');
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error('Official event response is too large');
  return new TextDecoder().decode(body);
}

function parseCandidates(html) {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();
  $('.event_board li').each((_index, element) => {
    const link = $(element).find('dd.data a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const href = link.attr('href')?.trim() ?? '';
    const match = href.match(EVENT_PATH);
    if (!match || !EVENT_TITLE.test(title) || seen.has(match[1])) return;
    const dateMatch = $(element).find('dd.date').text().match(DATE_RANGE);
    seen.add(match[1]);
    candidates.push({
      id: match[1],
      title,
      startDate: dateMatch ? isoDate(dateMatch) : null,
      endDate: dateMatch ? `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}` : null,
      sourceUrl: new URL(href, SOURCE_ORIGIN).toString(),
    });
  });
  return candidates;
}

function isActive(candidate, checkedDate) {
  return candidate.startDate && candidate.endDate
    && candidate.startDate <= checkedDate && checkedDate <= candidate.endDate;
}

export function unavailableStarforceEventStatus(checkedDate = null) {
  return { status: 'unavailable', checkedDate, sourceUrl: STARFORCE_EVENT_SOURCE_URL, candidates: [] };
}

export function createStarforceEventService({ fetchImpl = fetch, now = Date.now } = {}) {
  let cache = null;
  let inFlight = null;

  async function refresh(checkedDate) {
    try {
      const activeCandidates = parseCandidates(await fetchHtml(fetchImpl, STARFORCE_EVENT_SOURCE_URL))
        .filter((candidate) => isActive(candidate, checkedDate));
      const truncated = activeCandidates.length > MAX_CANDIDATES;
      const candidates = activeCandidates.slice(0, MAX_CANDIDATES);
      const verified = (await Promise.all(candidates.map(async (candidate) => {
        const detail = await fetchHtml(fetchImpl, candidate.sourceUrl);
        return STARFORCE_DETAIL.test(cheerio.load(detail).text()) ? candidate : null;
      }))).filter(Boolean);
      return {
        status: verified.length ? 'verification-required' : truncated ? 'unavailable' : 'none',
        checkedDate,
        sourceUrl: STARFORCE_EVENT_SOURCE_URL,
        candidates: verified,
      };
    } catch {
      return unavailableStarforceEventStatus(checkedDate);
    }
  }

  return {
    async getStatus() {
      const checkedDate = kstDate(now());
      if (cache?.checkedDate === checkedDate) return cache;
      if (inFlight?.checkedDate === checkedDate) return inFlight.promise;
      const promise = refresh(checkedDate).then((result) => {
        cache = result;
        return result;
      }).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { checkedDate, promise };
      return promise;
    },
  };
}
