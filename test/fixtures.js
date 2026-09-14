export function responses(date = '2026-09-08') {
  return {
    id: { ocid: 'test-ocid' },
    basic: { date: `${date}T00:00+09:00`, character_name: '검증캐릭터', character_class: '히어로', character_level: 280, world_name: '스카니아', character_image: 'https://open.api.nexon.com/static/maplestory/character/test.png' },
    equipment: { date, preset_no: 1, item_equipment: [{ item_name: '검증 장갑', item_equipment_slot: '장갑', starforce: '18', item_icon: 'https://open.api.nexon.com/static/maplestory/item/test.png', item_description: '검증용 장비 설명', item_shape_name: '검증 장갑 외형', item_shape_icon: 'https://open.api.nexon.com/static/maplestory/item/shape.png', item_gender: '공용', equipment_level_increase: 3, growth_exp: 1200, growth_level: 2, special_ring_level: 0, scroll_resilience_count: '1', potential_option_grade: '레전드리', potential_option_1: '크리티컬 데미지 : +8%', item_total_option: { str: '150', base_equipment_level: 200 }, item_add_option: { str: '60', equipment_level_decrease: 0 } }] },
    cash: { date, preset_no: 1, cash_item_equipment_base: [], additional_cash_item_equipment_base: [] },
    stat: { date, final_stat: [{ stat_name: 'STR', stat_value: '38000' }] },
    set: { date, set_effect: [{ set_name: '검증 세트', total_set_count: 3, set_effect_info: [{ set_count: 3, set_option: '공격력 +50' }] }] },
  };
}
export function upstream(raw = responses(), override) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (override) return override(url, calls.length);
    const path = url.pathname.split('/').at(-1);
    const key = { 'item-equipment': 'equipment', 'cashitem-equipment': 'cash', 'set-effect': 'set' }[path] || path;
    return Response.json(raw[key]);
  };
  return { calls, fetchImpl };
}
