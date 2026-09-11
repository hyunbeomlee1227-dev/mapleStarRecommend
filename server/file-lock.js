import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';

export async function withFileLock(path, task, { timeoutMs = 2000, staleMs = 30000, pollMs = 25 } = {}) {
  await mkdir(dirname(path), { recursive: true });
  let release;
  try {
    release = await lockfile.lock(path, {
      realpath: false,
      stale: staleMs,
      update: Math.max(1000, Math.floor(staleMs / 2)),
      retries: {
        retries: Math.ceil(timeoutMs / pollMs),
        factor: 1,
        minTimeout: pollMs,
        maxTimeout: pollMs,
        randomize: false,
      },
    });
  } catch (error) {
    if (error.code === 'ELOCKED') throw new Error('FILE_LOCK_TIMEOUT');
    throw error;
  }
  try {
    return await task();
  } finally {
    await release();
  }
}
