const nonStarforceParts = new Set(['보조무기', '엠블렘', '훈장', '뱃지', '포켓 아이템', '칭호']);

export function supportsStarforce(item) {
  const star = Number(item?.starforce);
  if (!Number.isInteger(star) || star < 0 || star > 30) return false;
  if (Number(item.special_ring_level) > 0) return false;
  if (item.item_equipment_slot === '보조무기' || item.item_equipment_part === '보조무기') {
    return item.item_equipment_part === '방패' || item.item_name?.startsWith('아스트라 ') || star > 0;
  }
  return !nonStarforceParts.has(item.item_equipment_slot) && !nonStarforceParts.has(item.item_equipment_part);
}
