import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsStandardStarforce, supportsStarforce } from '../shared/equipment.js';

test('starforce support handles Astra secondary weapons and special rings', () => {
  assert.equal(supportsStarforce({ item_name: '아스트라 여의보주', item_equipment_slot: '보조무기', item_equipment_part: '보조무기', starforce: '18' }), true);
  assert.equal(supportsStarforce({ item_name: '리스트레인트 링', item_equipment_slot: '반지4', item_equipment_part: '반지', starforce: '0', special_ring_level: 4 }), false);
  assert.equal(supportsStarforce({ item_name: '마이스터링', item_equipment_slot: '반지2', item_equipment_part: '반지', starforce: '0' }), true);
  assert.equal(supportsStarforce({ item_name: '메달', item_equipment_slot: '보조무기', item_equipment_part: '보조무기', starforce: '0' }), false);
});

test('superior equipment keeps its stars but is excluded from standard calculations', () => {
  const superior = { item_name: '타일런트 히아데스 망토', item_description: '슈페리얼 장비', item_equipment_slot: '망토', starforce: '10' };
  assert.equal(supportsStarforce(superior), true);
  assert.equal(supportsStandardStarforce(superior), false);
  assert.equal(supportsStandardStarforce({ item_name: '앱솔랩스 나이트케이프', item_equipment_slot: '망토', starforce: '17' }), true);
});
