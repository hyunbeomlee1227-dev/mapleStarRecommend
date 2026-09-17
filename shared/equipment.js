const nonStarforceParts = new Set(['보조무기', '엠블렘', '훈장', '뱃지', '포켓 아이템', '칭호']);

export function isCashItem(item) {
  return item?.item_kind === 'cash';
}

export function supportsEnhancement(item) {
  return !isCashItem(item);
}

export function supportsStarforce(item) {
  const star = Number(item?.starforce);
  if (!Number.isInteger(star) || star < 0 || star > 30) return false;
  if (Number(item.special_ring_level) > 0) return false;
  if (item.item_equipment_slot === '보조무기' || item.item_equipment_part === '보조무기') {
    return item.item_equipment_part === '방패' || item.item_name?.startsWith('아스트라 ') || star > 0;
  }
  return !nonStarforceParts.has(item.item_equipment_slot) && !nonStarforceParts.has(item.item_equipment_part);
}

const zeroWeaponNamePattern = /(?:^|\s)(?:라피스|라즐리)(?:\s|$)/;

export function standardStarforceSupport(item) {
  if (!supportsStarforce(item)) return { supported: false, code: 'not-applicable', message: null };
  if (/슈페리얼/.test(item.item_description ?? '') || item.item_name?.startsWith('타일런트 ')) {
    return {
      supported: false,
      code: 'superior-equipment',
      message: '슈페리얼 장비는 전용 강화 규칙 검증 전 일반 스타포스 비용 계산에서 제외합니다.',
    };
  }
  if (zeroWeaponNamePattern.test(item.item_name ?? '')) {
    return {
      supported: false,
      code: 'zero-weapon',
      message: '제로 무기는 전용 강화 규칙 검증 전 일반 스타포스 비용 계산에서 제외합니다.',
    };
  }
  return { supported: true, code: 'standard', message: null };
}

export function supportsStandardStarforce(item) {
  return standardStarforceSupport(item).supported;
}
