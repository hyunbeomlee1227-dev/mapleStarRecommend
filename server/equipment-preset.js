const FARMING_SIGNALS = [
  ['경험치', /(?:획득\s*경험치|경험치\s*획득)|정령의\s*펜던트|혈맹의\s*반지/u],
  ['아이템 획득', /아이템\s*(?:드롭률|획득)/u],
  ['메소 획득', /메소\s*획득/u],
];

const POTENTIAL_WEIGHTS = [
  [/보스 몬스터 공격 시 데미지/u, 14],
  [/몬스터 방어율 무시/u, 12],
  [/크리티컬 데미지/u, 14],
  [/(?:공격력|마력)\s*:/u, 10],
  [/(?:올스탯|STR|DEX|INT|LUK|최대 HP)\s*:/u, 5],
  [/데미지\s*:/u, 8],
];

function itemText(item) {
  return [
    item.item_name,
    item.item_description,
    item.soul_option,
    ...[1, 2, 3].flatMap((line) => [
      item[`potential_option_${line}`],
      item[`additional_potential_option_${line}`],
    ]),
  ].filter(Boolean).join(' ');
}

function farmingReasons(items) {
  const text = items.map(itemText).join(' ');
  return FARMING_SIGNALS.flatMap(([reason, pattern]) => pattern.test(text) ? [reason] : []);
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function potentialScore(item) {
  return [1, 2, 3].flatMap((line) => [
    item[`potential_option_${line}`],
    item[`additional_potential_option_${line}`],
  ]).filter(Boolean).reduce((score, option) => {
    const weight = POTENTIAL_WEIGHTS.find(([pattern]) => pattern.test(option))?.[1] ?? 0;
    return score + number(option) * weight;
  }, 0);
}

function combatScore(items) {
  return items.reduce((score, item) => {
    const total = item.item_total_option ?? {};
    const primaryStat = Math.max(number(total.str), number(total.dex), number(total.int), number(total.luk), number(total.max_hp) / 10);
    const attack = Math.max(number(total.attack_power), number(total.magic_power));
    const boss = number(total.boss_damage);
    const ignoreDefense = number(total.ignore_monster_armor);
    const damage = number(total.damage);
    const allStat = number(total.all_stat);
    return score + primaryStat + attack * 8 + boss * 14 + ignoreDefense * 12 + damage * 8 + allStat * 5 + potentialScore(item);
  }, 0);
}

export function selectBossEquipmentPreset({ activePreset = null, currentItems = [], presets = [] }) {
  const candidates = presets
    .filter(({ preset, items }) => Number.isSafeInteger(preset) && Array.isArray(items) && items.length > 0)
    .map(({ preset, items }) => ({ preset, items, reasons: farmingReasons(items), score: combatScore(items) }));
  if (!candidates.length && currentItems.length > 0) {
    return {
      preset: activePreset,
      items: currentItems,
      selection: { status: 'current-only', strategy: 'boss-combat-options-v1', excludedPresets: [], selectedFarmingReasons: farmingReasons(currentItems) },
    };
  }
  if (currentItems.length > 0 && Number.isSafeInteger(activePreset) && !candidates.some(({ preset }) => preset === activePreset)) {
    candidates.push({ preset: activePreset, items: currentItems, reasons: farmingReasons(currentItems), score: combatScore(currentItems) });
  }
  if (!candidates.length) {
    return {
      preset: activePreset,
      items: currentItems,
      selection: { status: 'current-only', strategy: 'boss-combat-options-v1', excludedPresets: [], selectedFarmingReasons: farmingReasons(currentItems) },
    };
  }

  const clean = candidates.filter(({ reasons }) => reasons.length === 0);
  const pool = clean.length ? clean : candidates;
  pool.sort((left, right) => {
    if (!clean.length && left.reasons.length !== right.reasons.length) return left.reasons.length - right.reasons.length;
    return right.score - left.score || Number(right.preset === activePreset) - Number(left.preset === activePreset) || left.preset - right.preset;
  });
  const selected = pool[0];
  return {
    preset: selected.preset,
    items: selected.items,
    selection: {
      status: clean.length ? 'selected' : 'farming-fallback',
      strategy: 'boss-combat-options-v1',
      excludedPresets: candidates
        .filter(({ reasons }) => reasons.length > 0)
        .sort((left, right) => left.preset - right.preset)
        .map(({ preset, reasons }) => ({ preset, reasons })),
      selectedFarmingReasons: selected.reasons,
    },
  };
}
