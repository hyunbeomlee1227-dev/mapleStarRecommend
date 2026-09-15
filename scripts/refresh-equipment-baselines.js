import { resolve } from 'node:path';
import { refreshJobStratifiedEquipmentBaselines } from '../server/equipment-baselines.js';
import { withFileLock } from '../server/file-lock.js';
import { MAPLE_FINAL_JOBS } from '../server/maple-jobs.js';
import { createNexonService, snapshotDate } from '../server/nexon.js';

function integerArgument(name, fallback, minimum, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
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
const samplesPerJob = integerArgument('samples-per-job', 8, 3, 9);
const output = resolve('data/equipment-baselines.json');
const service = createNexonService({
  apiKey,
  dailyLimit: Number(process.env.NEXON_DAILY_LIMIT ?? 1000),
  intervalMs: Math.max(250, Number(process.env.NEXON_INTERVAL_MS ?? 250)),
  quotaFile: resolve('.runtime/nexon-quota.json'),
});

await withFileLock(`${output}.refresh-locks`, async () => {
  const result = await refreshJobStratifiedEquipmentBaselines({ service, date, samplesPerJob, classFilters: MAPLE_FINAL_JOBS, output });
  process.stdout.write(`Saved ${result.sample.succeeded} anonymized samples across ${result.sampling.succeededJobs} jobs for ${date}.\n`);
}, { timeoutMs: 2000, staleMs: 30 * 60000 });
