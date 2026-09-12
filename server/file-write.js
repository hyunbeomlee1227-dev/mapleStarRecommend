import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export async function writeFileAtomically(path, content, {
  attempts = 6,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content);
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await rename(temporaryPath, path);
        return;
      } catch (error) {
        if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code) || attempt === attempts) throw error;
        await sleep(attempt * 25);
      }
    }
  } finally {
    await unlink(temporaryPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
