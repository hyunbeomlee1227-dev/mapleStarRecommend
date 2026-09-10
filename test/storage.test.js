import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRecent, saveRecent, clearRecent } from '../src/storage.js';
function memory(initial = '[]') { let value = initial; return { getItem: () => value, setItem: (_key, next) => { value = next; }, removeItem: () => { value = null; } }; }
test('recent searches expire, deduplicate, stay bounded and can be deleted', () => {
  const storage = memory(); const now = Date.now();
  for (let i = 0; i < 10; i++) saveRecent(`캐릭터${i}`, storage, now);
  assert.equal(readRecent(storage, now).length, 6);
  saveRecent('캐릭터9', storage, now); assert.equal(readRecent(storage, now).length, 6);
  assert.equal(readRecent(storage, now + 30 * 86400000).length, 0);
  saveRecent('검증', storage, now); clearRecent(storage); assert.deepEqual(readRecent(storage, now), []);
});
test('corrupted and inaccessible storage never break lookup', () => {
  assert.deepEqual(readRecent(memory('{broken')), []);
  assert.deepEqual(readRecent(memory('[null,{},42]')), []);
  assert.deepEqual(readRecent({ getItem() { throw new Error(); } }), []);
});
