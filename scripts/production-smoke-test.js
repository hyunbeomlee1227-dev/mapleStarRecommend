const baseUrl = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
const secretMarker = process.env.SMOKE_TEST_SECRET || '';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30000);

if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
  throw new Error('SMOKE_TIMEOUT_MS must be an integer of at least 1000 milliseconds.');
}

const deadline = Date.now() + timeoutMs;
async function waitUntilReady() {
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/healthz', baseUrl), { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Production server did not become ready: ${lastError?.message || 'timeout'}`);
}

async function expectResponse(pathname, contentType = null) {
  const response = await fetch(new URL(pathname, baseUrl), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}.`);
  if (contentType && !response.headers.get('content-type')?.includes(contentType)) {
    throw new Error(`${pathname} did not return ${contentType}.`);
  }
  if (response.headers.has('x-powered-by')) throw new Error(`${pathname} exposes the server framework.`);
  const body = await response.text();
  if (secretMarker && body.includes(secretMarker)) throw new Error(`${pathname} exposes the smoke-test secret marker.`);
  return { body, response };
}

await waitUntilReady();
const { body: healthText, response: healthResponse } = await expectResponse('/healthz', 'application/json');
if (healthResponse.headers.get('cache-control') !== 'no-store') throw new Error('/healthz must not be cached.');
const healthBody = JSON.parse(healthText);
if (healthBody.status !== 'ok') throw new Error('/healthz did not report an ok status.');

const { body: html } = await expectResponse('/', 'text/html');
if (!html.includes('id="root"')) throw new Error('The production page is missing the application root.');

function referencedAssets(body, parentPath) {
  const references = new Set();
  const patterns = [
    /(?:src|href)=["']([^"']+)["']/g,
    /url\(\s*["']?([^"')]+)["']?\s*\)/g,
    /["']([^"']+\.(?:css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)(?:\?[^"']*)?)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const raw = match[1];
      if (raw.startsWith('data:') || raw.startsWith('http:') || raw.startsWith('https:')) continue;
      const normalized = raw.startsWith('assets/') ? `/${raw}` : new URL(raw, new URL(parentPath, baseUrl)).pathname;
      if (normalized.startsWith('/assets/')) references.add(normalized);
    }
  }
  return references;
}

const pendingAssets = [...referencedAssets(html, '/')];
if (pendingAssets.length === 0) throw new Error('The production page did not reference any built assets.');
const checkedAssets = new Set();
while (pendingAssets.length > 0) {
  const assetPath = pendingAssets.shift();
  if (checkedAssets.has(assetPath)) continue;
  if (checkedAssets.size >= 1000) throw new Error('The production asset graph exceeded the smoke-test limit.');
  checkedAssets.add(assetPath);
  const { body } = await expectResponse(assetPath);
  for (const reference of referencedAssets(body, assetPath)) {
    if (!checkedAssets.has(reference)) pendingAssets.push(reference);
  }
}

const { body: statusText } = await expectResponse('/api/status', 'application/json');
const status = JSON.parse(statusText);
if (status.configured !== true) throw new Error('/api/status did not confirm runtime secret configuration.');

console.log(`Production smoke test passed for ${baseUrl.origin}.`);
