import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomically } from '../server/file-write.js';

test('atomic file writer replaces existing content without leaving temporary files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-write-'));
  const target = join(folder, 'state.json');
  try {
    await writeFileAtomically(target, 'first');
    await writeFileAtomically(target, 'second');
    assert.equal(await readFile(target, 'utf8'), 'second');
    assert.deepEqual(await readdir(folder), ['state.json']);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
