import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withFileLock } from '../server/file-lock.js';

test('file lock serializes concurrent owners', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-lock-'));
  const target = join(folder, 'quota');
  let active = 0;
  let maximumActive = 0;
  const task = () => withFileLock(target, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
  });
  try {
    await Promise.all([task(), task(), task()]);
    assert.equal(maximumActive, 1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('file lock releases ownership when the task fails', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'maple-lock-release-'));
  const target = join(folder, 'quota');
  try {
    await assert.rejects(withFileLock(target, async () => { throw new Error('failed task'); }), /failed task/);
    await assert.doesNotReject(withFileLock(target, async () => {}));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
