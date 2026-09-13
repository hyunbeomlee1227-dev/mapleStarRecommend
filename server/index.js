import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { createNexonService } from './nexon.js';
import { loadGoals } from './goals.js';
import { loadUpgradeRules } from './rules.js';
import { createPotentialOptionsService } from './potential-options.js';
import { loadEquipmentTargets } from './equipment-targets.js';
import { loadEquipmentBaselines } from './equipment-baselines.js';

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
function integer(name, fallback, minimum = 1) {
  const number = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`Invalid configuration: ${name}`);
  return number;
}
function networkSettings() {
  const mode = process.env.TRUST_PROXY_MODE?.trim();
  if (!mode) return { trustProxy: integer('TRUST_PROXY_HOPS', 0, 0) || false };
  if (mode === 'render') return { clientIpHeader: 'cf-connecting-ip' };
  throw new Error('Invalid configuration: TRUST_PROXY_MODE');
}
const service = createNexonService({
  apiKey: process.env.NEXON_API_KEY?.trim(),
  dailyLimit: integer('NEXON_DAILY_LIMIT', 1000),
  intervalMs: Math.max(250, integer('NEXON_INTERVAL_MS', 250)),
  quotaFile: resolve('.runtime/nexon-quota.json'),
});
const goals = await loadGoals();
const rules = await loadUpgradeRules();
const equipmentTargets = await loadEquipmentTargets();
const equipmentBaselines = await loadEquipmentBaselines();
const potentialOptions = createPotentialOptionsService();
const app = createApp({ service, potentialOptions, goals, rules, equipmentTargets, equipmentBaselines, perMinute: integer('LOOKUP_LIMIT_PER_MINUTE', 12), potentialOptionsPerMinute: integer('POTENTIAL_OPTIONS_LIMIT_PER_MINUTE', 30), ...networkSettings() });
const server = createServer(app);
let vite;
if (production) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ server: { middlewareMode: true, hmr: { server }, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.runtime/**', '**/.agents/**', '**/.scratch/**', '**/server/**', '**/test/**'] } } });
  app.use(vite.middlewares);
}
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
let port = integer('PORT', 5173);
server.on('error', (error) => {
  if (!production && error.code === 'EADDRINUSE' && port < 5193) { port++; server.listen(port, host); }
  else { console.error('Server could not start:', error.code); process.exit(1); }
});
server.listen(port, host, () => console.log(`Server listening on http://${host}:${port}`));
async function close() { await vite?.close(); server.close(() => process.exit(0)); }
process.on('SIGTERM', close);
process.on('SIGINT', close);
