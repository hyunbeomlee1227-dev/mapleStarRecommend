import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildCombatSnapshot, assessGoal, numberFromStat } from '../server/combat.js';
import { loadGoals } from '../server/goals.js';
import { createApp } from '../server/app.js';

const completeStats = [
  ['최대 스탯공격력', '95,000,000'], ['데미지', '110'], ['보스 몬스터 데미지', '320'],
  ['최종 데미지', '62.5'], ['방어율 무시', '94.8%'], ['크리티컬 데미지', '86'],
].map(([stat_name, stat_value]) => ({ stat_name, stat_value }));

test('combat snapshot parses official stat strings without estimating damage', () => {
  const snapshot = buildCombatSnapshot(completeStats);
  assert.equal(snapshot.readiness, 'snapshot-ready');
  assert.equal(snapshot.values.maxAttack, 95000000);
  assert.equal(snapshot.values.ignoreDefense, 94.8);
  assert.equal(snapshot.damageEstimate, null);
  assert.equal(numberFromStat('12억'), null);
});

test('missing combat stats block goal assessment', () => {
  const snapshot = buildCombatSnapshot([{ stat_name: '전투력', stat_value: '1,000' }]);
  assert.equal(snapshot.readiness, 'missing-stats');
  assert.ok(snapshot.missing.includes('bossDamage'));
  assert.equal(assessGoal(snapshot, { benchmark: { status: 'pending' } }).status, 'insufficient-data');
});

test('uncalibrated boss goals never report a clear or a damage estimate', () => {
  const result = assessGoal(buildCombatSnapshot(completeStats), { id: 'lotus-extreme', benchmark: { status: 'pending' } });
  assert.deepEqual(result, { status: 'benchmark-pending', message: '이 보스의 솔로 클리어 기준은 아직 관리자 검증 전입니다.' });
});

test('official goal catalog is ordered and defaults to its final supported goal', async () => {
  const goals = await loadGoals();
  assert.ok(goals.goals.length >= 10);
  assert.equal(goals.goals.find((goal) => goal.id === 'lotus-extreme').difficulty, '익스트림');
  assert.equal(goals.defaultGoalId, 'jupiter-hard');
  assert.ok(goals.goals.every((goal, index) => index === 0 || goals.goals[index - 1].order < goal.order));
});

test('goal and assessment endpoints expose pending status without requiring an API key', async () => {
  const goals = await loadGoals();
  const app = createApp({ service: { configured: false, lookup() {} }, goals });
  const catalog = await request(app).get('/api/goals');
  assert.equal(catalog.status, 200); assert.equal(catalog.body.defaultGoalId, 'jupiter-hard');
  const result = await request(app).post('/api/assessment').send({ goalId: 'lotus-extreme', combat: buildCombatSnapshot(completeStats) });
  assert.equal(result.status, 200); assert.equal(result.body.status, 'benchmark-pending');
  assert.equal(result.body.damageEstimate, undefined);
});
