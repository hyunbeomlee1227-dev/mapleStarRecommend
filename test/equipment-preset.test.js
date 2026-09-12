import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBossEquipmentPreset } from '../server/equipment-preset.js';

function item(name, overrides = {}) {
  return {
    item_name: name,
    item_equipment_slot: '반지',
    item_total_option: { str: '100', attack_power: '10' },
    ...overrides,
  };
}

test('boss preset selection excludes experience, item drop and meso equipment', () => {
  const result = selectBossEquipmentPreset({
    activePreset: 1,
    presets: [
      { preset: 1, items: [item('드롭 반지', { potential_option_1: '아이템 드롭률 : +20%' })] },
      { preset: 2, items: [item('보스 반지', { potential_option_1: '보스 몬스터 공격 시 데미지 : +30%' })] },
      { preset: 3, items: [item('메소 반지', { potential_option_1: '메소 획득량 : +20%' }), item('준비된 정령의 펜던트')] },
    ],
  });

  assert.equal(result.preset, 2);
  assert.deepEqual(result.items.map(({ item_name }) => item_name), ['보스 반지']);
  assert.equal(result.selection.status, 'selected');
  assert.deepEqual(result.selection.excludedPresets, [
    { preset: 1, reasons: ['아이템 획득'] },
    { preset: 3, reasons: ['경험치', '메소 획득'] },
  ]);
});

test('boss preset selection chooses the strongest boss profile among clean presets', () => {
  const result = selectBossEquipmentPreset({
    activePreset: 1,
    presets: [
      { preset: 1, items: [item('일반 반지')] },
      { preset: 2, items: [item('주스탯 반지', { potential_option_1: 'STR : +12%' })] },
      { preset: 3, items: [item('보스 반지', {
        potential_option_1: '보스 몬스터 공격 시 데미지 : +40%',
        potential_option_2: '몬스터 방어율 무시 : +30%',
      })] },
    ],
  });

  assert.equal(result.preset, 3);
  assert.equal(result.selection.strategy, 'boss-combat-options-v1');
});

test('boss preset selection keeps the least farming-oriented fallback when every preset farms', () => {
  const result = selectBossEquipmentPreset({
    activePreset: 1,
    presets: [
      { preset: 1, items: [item('드메 반지', { potential_option_1: '아이템 드롭률 : +20%', potential_option_2: '메소 획득량 : +20%' })] },
      { preset: 2, items: [item('획득 반지', { potential_option_1: '아이템 드롭률 : +20%' })] },
    ],
  });

  assert.equal(result.preset, 2);
  assert.equal(result.selection.status, 'farming-fallback');
  assert.deepEqual(result.selection.selectedFarmingReasons, ['아이템 획득']);
});

test('boss preset selection falls back to current equipment when presets are unavailable', () => {
  const current = [item('현재 반지')];
  const result = selectBossEquipmentPreset({ activePreset: 2, currentItems: current, presets: [] });

  assert.equal(result.preset, 2);
  assert.equal(result.items, current);
  assert.equal(result.selection.status, 'current-only');
});

test('item growth experience text is not mistaken for an experience farming preset', () => {
  const result = selectBossEquipmentPreset({
    activePreset: 1,
    presets: [{ preset: 1, items: [item('성장형 무기', { item_description: '성장 경험치가 누적되는 장비' })] }],
  });

  assert.equal(result.selection.status, 'selected');
  assert.deepEqual(result.selection.excludedPresets, []);
});
