import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Gem, Shield, Star, Swords } from 'lucide-react';
import { canLookupPotentialOptions } from './PotentialOptionsDialog';
import { supportsStarforce } from '../shared/equipment';

const statLabels = {
  str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', max_hp: '최대 HP', max_mp: '최대 MP',
  attack_power: '공격력', magic_power: '마력', armor: '방어력', speed: '이동속도', jump: '점프력',
  boss_damage: '보스 데미지', ignore_monster_armor: '몬스터 방어율 무시', damage: '데미지',
  all_stat: '올스탯', max_hp_rate: '최대 HP', max_mp_rate: '최대 MP',
  equipment_level_decrease: '착용 레벨 감소',
};
const statOrder = ['str', 'dex', 'int', 'luk', 'all_stat', 'max_hp', 'max_hp_rate', 'max_mp', 'max_mp_rate', 'attack_power', 'magic_power', 'armor', 'speed', 'jump', 'boss_damage', 'damage', 'ignore_monster_armor', 'equipment_level_decrease'];
const percentageStats = new Set(['all_stat', 'max_hp_rate', 'max_mp_rate', 'boss_damage', 'damage', 'ignore_monster_armor']);
const optionSources = [
  ['base', 'item_base_option'],
  ['additional', 'item_add_option'],
  ['scroll', 'item_etc_option'],
  ['starforce', 'item_starforce_option'],
  ['exceptional', 'item_exceptional_option'],
];

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formattedValue(key, value, showPlus = true) {
  const parsed = numberValue(value);
  if (parsed === null) return String(value ?? '');
  const sign = showPlus && parsed > 0 ? '+' : '';
  return `${sign}${parsed.toLocaleString('ko-KR')}${percentageStats.has(key) ? '%' : ''}`;
}

function EquipmentIcon({ item }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.item_icon]);
  const Fallback = item.item_equipment_part === '무기' ? Swords : item.item_equipment_part?.includes('반지') || item.item_equipment_part === '귀고리' ? Gem : Shield;
  return <span className="tooltip-item-icon">{item.item_icon && !failed ? <img src={item.item_icon} alt="" onError={() => setFailed(true)} /> : <Fallback aria-hidden="true" />}</span>;
}

function StarRow({ count }) {
  if (!count) return null;
  return <div className="tooltip-stars" aria-label={`스타포스 ${count}성`}>{Array.from({ length: count }, (_, index) => <Star key={index} size={13} fill="currentColor" aria-hidden="true" />)}</div>;
}

function StatBreakdown({ item }) {
  const total = item.item_total_option || {};
  const keys = Object.keys(total)
    .filter((key) => key !== 'base_equipment_level' && numberValue(total[key]) !== 0 && numberValue(total[key]) !== null)
    .sort((a, b) => (statOrder.indexOf(a) < 0 ? 999 : statOrder.indexOf(a)) - (statOrder.indexOf(b) < 0 ? 999 : statOrder.indexOf(b)));
  if (!keys.length) return <p className="tooltip-empty">표시할 장비 옵션이 없습니다.</p>;
  return <dl className="tooltip-stats">{keys.map((key) => {
    const pieces = optionSources.flatMap(([className, source]) => {
      const value = numberValue(item[source]?.[key]);
      if (value === null || (value === 0 && className !== 'base')) return [];
      return [<span className={`option-source-${className}`} key={source}>{formattedValue(key, value, false)}</span>];
    });
    return <div key={key} data-stat={key}><dt>{statLabels[key] || key}</dt><dd><strong>{formattedValue(key, total[key])}</strong>{pieces.length > 1 && <span className="option-components">({pieces.reduce((nodes, piece, index) => [...nodes, index ? '+' : '', piece], [])})</span>}</dd></div>;
  })}</dl>;
}

function PotentialBlock({ item, additional = false }) {
  const prefix = additional ? 'additional_' : '';
  const grade = item[`${prefix}potential_option_grade`];
  if (!grade) return null;
  const options = [1, 2, 3].map((index) => item[`${prefix}potential_option_${index}`]).filter(Boolean);
  const title = additional ? '에디셔널 잠재능력' : '잠재능력';
  return <section className="tooltip-potential"><h4 aria-label={title}><span className="potential-marker" aria-hidden="true">L</span>{title} : <strong>{grade}</strong></h4><ul>{options.map((option, index) => <li key={index}>{String(option).replace(/\s*:\s*/, ' ')}</li>)}</ul></section>;
}

function ScrollResult({ values }) {
  const entries = Object.entries(values || {}).filter(([, value]) => numberValue(value) !== 0 && numberValue(value) !== null);
  if (!entries.length) return null;
  return <p className="tooltip-scroll-result"><span>강화 결과</span>{entries.map(([key, value]) => <strong key={key}>{statLabels[key] || key} {formattedValue(key, value)}</strong>)}</p>;
}

export default function EquipmentTooltip({ item, characterJob, onOpenPotentialOptions }) {
  const stars = supportsStarforce(item) ? Number(item.starforce) || 0 : 0;
  const upgrades = Number(item.scroll_upgrade) || 0;
  const level = numberValue(item.item_total_option?.base_equipment_level ?? item.item_base_option?.base_equipment_level);
  const remaining = numberValue(item.scroll_upgradeable_count);
  const resilience = numberValue(item.scroll_resilience_count);
  return <article className="equipment-tooltip" aria-label={`${item.item_name} 전체 장비 옵션`}>
    <header className="tooltip-header">
      <StarRow count={stars} />
      <h3>{item.item_name}{upgrades > 0 ? ` (+${upgrades})` : ''}</h3>
      {item.item_description && <p>{item.item_description}</p>}
    </header>
    <div className="tooltip-summary">
      <EquipmentIcon item={item} />
      <div className="tooltip-summary-copy"><div className="tooltip-tags"><span>{item.item_equipment_part || item.item_equipment_slot}</span>{item.item_gender && <span>{item.item_gender}</span>}</div><p>착용 캐릭터 직업 <strong>{characterJob || '정보 없음'}</strong></p>{level !== null && <p>요구 레벨 <strong>Lv. {level}</strong></p>}{item.item_shape_name && item.item_shape_name !== item.item_name && <p>외형 <strong>{item.item_shape_name}</strong></p>}</div>
    </div>
    <section className="tooltip-section tooltip-stat-section"><StatBreakdown item={item} /></section>
    {(upgrades > 0 || remaining !== null || resilience !== null) && <section className="tooltip-section tooltip-upgrade"><div><strong>주문서 강화 {upgrades}회</strong><span>(잔여 {remaining ?? 0}회, 복구 가능 {resilience ?? 0}회)</span></div>{item.golden_hammer_flag && <small>황금 망치 {item.golden_hammer_flag}</small>}<p className="tooltip-scroll-kind"><span>강화 종류</span><strong>Open API 미제공</strong></p><ScrollResult values={item.item_etc_option} /></section>}
    {(item.growth_level || item.soul_name) && <section className="tooltip-section tooltip-extra">{item.growth_level ? <p>성장 레벨 <strong>{item.growth_level}</strong>{item.growth_exp != null && <span> · 경험치 {Number(item.growth_exp).toLocaleString('ko-KR')}</span>}</p> : null}{item.soul_name && <p>{item.soul_name} · {item.soul_option || '소울 옵션 정보 없음'}</p>}</section>}
    <PotentialBlock item={item} />
    <PotentialBlock item={item} additional />
    <button className="tooltip-official-options" disabled={!canLookupPotentialOptions(item)} onClick={onOpenPotentialOptions}>공식 잠재 옵션표 보기<ArrowUpRight size={13} /></button>
  </article>;
}
