import { resolve } from 'node:path';
import { refreshEquipmentBaselines } from '../server/equipment-baselines.js';
import { withFileLock } from '../server/file-lock.js';
import { createNexonService, snapshotDate } from '../server/nexon.js';

function integerArgument(name, fallback, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return value;
}

function dateArgument() {
  const raw = process.argv.find((argument) => argument.startsWith('--date='))?.slice('--date='.length);
  const date = raw ?? snapshotDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must use YYYY-MM-DD');
  return date;
}

const apiKey = process.env.NEXON_API_KEY?.trim();
if (!apiKey) throw new Error('NEXON_API_KEY is not configured');

const date = dateArgument();
const limit = integerArgument('limit', 20, 50);
const output = resolve('data/equipment-baselines.json');
const service = createNexonService({
  apiKey,
  dailyLimit: Number(process.env.NEXON_DAILY_LIMIT ?? 1000),
  intervalMs: Math.max(250, Number(process.env.NEXON_INTERVAL_MS ?? 250)),
  quotaFile: resolve('.runtime/nexon-quota.json'),
});

await withFileLock(`${output}.refresh-locks`, async () => {
  const result = await refreshEquipmentBaselines({ service, date, limit, output });
  process.stdout.write(`Saved ${result.sample.succeeded}/${result.sample.requested} anonymized samples for ${date}.\n`);
}, { timeoutMs: 2000, staleMs: 30 * 60000 });
