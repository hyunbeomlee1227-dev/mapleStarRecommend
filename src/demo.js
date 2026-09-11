const definitions = [
  ['무기', '아케인셰이드 투핸드소드', '22', '레전드리', ['공격력 : +12%', '보스 몬스터 공격 시 데미지 : +40%', '공격력 : +9%'], '유니크'],
  ['보조무기', '메달', '0', '레전드리', ['보스 몬스터 공격 시 데미지 : +40%', '공격력 : +9%', '몬스터 방어율 무시 : +30%'], '에픽'],
  ['엠블렘', '골드 메이플리프 엠블렘', '0', '레전드리', ['공격력 : +12%', '공격력 : +9%', 'STR : +9%'], '에픽'],
  ['모자', '하이네스 워리어헬름', '18', '유니크', ['STR : +9%', 'STR : +6%', '최대 HP : +6%'], '에픽'],
  ['상의', '이글아이 워리어아머', '17', '유니크', ['STR : +9%', 'STR : +6%', 'DEX : +6%'], '레어'],
  ['하의', '트릭스터 워리어팬츠', '17', '유니크', ['STR : +9%', 'STR : +6%', '최대 HP : +6%'], '에픽'],
  ['장갑', '아케인셰이드 나이트글러브', '18', '레전드리', ['크리티컬 데미지 : +8%', 'STR : +9%', 'DEX : +9%'], '유니크'],
  ['신발', '아케인셰이드 나이트슈즈', '17', '유니크', ['STR : +9%', 'STR : +6%', '이동속도 : +8'], '에픽'],
  ['귀고리', '에스텔라 이어링', '17', '유니크', ['STR : +9%', 'STR : +6%', 'DEX : +6%'], '에픽'],
  ['반지1', '가디언 엔젤 링', '18', '레전드리', ['STR : +12%', 'STR : +9%', '최대 HP : +9%'], '에픽'],
  ['반지2', '마이스터링', '17', '유니크', ['STR : +9%', 'STR : +6%', '최대 HP : +6%'], '에픽'],
];

export const demo = {
  source: 'demo', date: null, preset: 1,
  character: { name: '예시 히어로', job: '히어로', level: 280, world: '예시 월드', image: 'https://lwi.nexon.com/maplestory/common/login_char_guide.png' },
  items: definitions.map(([slot, name, stars, grade, lines, additional], index) => ({
    item_name: name, item_equipment_slot: slot, item_equipment_part: slot.replace(/\d/g, ''), item_icon: null,
    starforce: stars, potential_option_grade: grade, additional_potential_option_grade: additional,
    potential_option_1: lines[0], potential_option_2: lines[1], potential_option_3: lines[2],
    additional_potential_option_1: '공격력 : +10', additional_potential_option_2: 'STR : +2%', additional_potential_option_3: '최대 HP : +100',
    item_total_option: { str: String(90 + index * 7), attack_power: String(index === 0 ? 480 : 35), max_hp: '100', base_equipment_level: index === 0 || index === 6 || index === 7 ? 200 : 150 },
    item_base_option: { str: '30', attack_power: String(index === 0 ? 295 : 5) },
    item_add_option: { str: '40', all_stat: '5' }, item_starforce_option: { str: '20', attack_power: '25' },
    item_etc_option: { str: '12', attack_power: '8' }, scroll_upgrade: index === 1 || index === 2 ? '0' : '8', scroll_upgradeable_count: index === 1 || index === 2 ? '0' : '2', golden_hammer_flag: index === 1 || index === 2 ? null : '적용',
  })),
  stats: [{ stat_name: 'STR', stat_value: '38420' }, { stat_name: '보스 몬스터 데미지', stat_value: '320' }, { stat_name: '방어율 무시', stat_value: '94.8' }, { stat_name: '크리티컬 데미지', stat_value: '86' }],
  sets: [{ set_name: '예시 세트 효과', total_set_count: 3, set_effect_info: [{ set_count: 3, set_option: '공격력 : +50' }] }],
  combat: {
    values: { minAttack: 85000000, maxAttack: 95000000, damage: 110, bossDamage: 320, finalDamage: 62, ignoreDefense: 94.8, criticalRate: 100, criticalDamage: 86, combatPower: 100000000, arcaneForce: 1350, authenticForce: 660 },
    readiness: 'snapshot-ready', missing: [], damageEstimate: null,
    message: '능력치 스냅샷을 확인했습니다. 직업별 전투식 검증 후 예상 최종뎀을 계산합니다.',
  },
};
