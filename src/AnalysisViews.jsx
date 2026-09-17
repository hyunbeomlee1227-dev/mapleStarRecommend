import React from 'react';
import { Check, Star } from 'lucide-react';
export { supportsStarforce } from '../shared/equipment';

const gradeStyles = { 레전드리: 'legendary', 유니크: 'unique', 에픽: 'epic', 레어: 'rare' };
const gradeNames = { legendary: '레전드리', unique: '유니크', epic: '에픽', rare: '레어' };
const statLabels = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', attack_power: '공격력', magic_power: '마력', max_hp: '최대 HP', max_mp: '최대 MP', all_stat: '올스탯 (%)', boss_damage: '보스 데미지 (%)', ignore_monster_armor: '방어율 무시 (%)', damage: '데미지 (%)', armor: '방어력', speed: '이동속도', jump: '점프력' };
const mesos = new Intl.NumberFormat('ko-KR');

function Badge({ grade }) {
  return <span className={`grade ${gradeStyles[grade] || ''}`}>{grade || '정보 없음'}</span>;
}

function OptionSummary({ item, additional = false }) {
  return <span>{[1, 2, 3].map((line) => item[`${additional ? 'additional_' : ''}potential_option_${line}`]).filter(Boolean).join(' · ') || '옵션 정보 없음'}</span>;
}

function StatChanges({ values }) {
  const entries = Object.entries(values || {}).filter(([, value]) => value != null && value !== '0');
  return entries.length ? <dl>{entries.map(([key, value]) => <div key={key}><dt>{statLabels[key] || key}</dt><dd>+{value}</dd></div>)}</dl> : <span className="muted">옵션 정보 없음</span>;
}

export function UpgradeView({ items }) {
  return <div className="analysis-view"><div className="view-heading"><div><span className="eyebrow">EQUIPMENT UPGRADE</span><h3>장비 업그레이드</h3></div><span>주문서 강화와 추가옵션을 분리해 표시합니다.</span></div><div className="upgrade-list">{items.map((item, index) => <section key={`${item.item_equipment_slot}-${index}`}><header><strong>{item.item_name}</strong><span>{item.item_equipment_slot}</span></header><div className="upgrade-metrics"><p><span>업그레이드 완료</span><strong>{item.scroll_upgrade ?? '정보 없음'}</strong></p><p><span>남은 횟수</span><strong>{item.scroll_upgradeable_count ?? '정보 없음'}</strong></p><p><span>황금망치</span><strong>{item.golden_hammer_flag ?? '정보 없음'}</strong></p></div><div className="upgrade-options"><div><h4>추가옵션</h4><StatChanges values={item.item_add_option} /></div><div><h4>업그레이드 증가량</h4><StatChanges values={item.item_etc_option} /></div></div></section>)}</div></div>;
}

export function StarforceView({ risks, unsupportedItems = [], eventStatus = 'none' }) {
  const eventBlocked = eventStatus !== 'none';
  return <div className="analysis-view"><div className="view-heading"><div><span className="eyebrow">STAR FORCE</span><h3>스타포스 강화</h3></div><span>{risks.length}개 장비 계산 가능</span></div>{risks.length ? <div className="tier-table starforce-table"><div className="tier-head"><span>장비</span><span>현재</span><span>1회 비용</span><span>스페어 보유 시 기대 메소</span><span>성공</span><span>파괴</span><span>온전 복구</span></div>{risks.map((risk, index) => <div className="tier-row" key={`${risk.slot}-${risk.itemName}-${index}`}><strong>{risk.itemName}<small>{risk.destroyProbability === 0 ? '파괴 없음' : risk.traceRecoveryStar === null ? '복구 비용 계산 불가' : `파괴 시 ${risk.traceRecoveryStar}성 흔적`}</small></strong><span className="star-value"><Star size={12} fill="currentColor" />{risk.currentStar}성</span><span>{mesos.format(risk.attemptCost)}</span><span>{risk.expectedMesoWithOwnedRecoveryItems === null ? '계산 불가' : <>{mesos.format(risk.expectedMesoWithOwnedRecoveryItems)} 메소<small>기대 소모 장비 {risk.expectedRecoveryCopies.toFixed(2)}개</small></>}</span><span>{(risk.successProbability * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%</span><span>{(risk.destroyProbability * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%</span><span>{risk.intactRecoveryCopies === null ? '-' : <>{mesos.format(risk.intactRecoveryMeso)} 메소<small>동일 장비 {risk.intactRecoveryCopies}개</small></>}</span></div>)}</div> : <p className="view-empty">{eventBlocked ? '기간 이벤트 확인 전에는 스타포스 비용과 위험 계산을 표시하지 않습니다.' : '스타포스 확률을 계산할 수 있는 장비가 없습니다.'}</p>}{unsupportedItems.length > 0 && <section className="unsupported-starforce" aria-label="스타포스 계산 미지원 장비"><h4>전용 규칙 확인 필요</h4>{unsupportedItems.map((item, index) => <p key={`${item.slot}-${item.itemName}-${index}`}><strong>{item.itemName}<small>{item.slot} · {item.currentStar}성</small></strong><span>{item.message}</span></p>)}</section>}<p className="calculation-note">온전 복구를 선택하고 필요한 동일 장비를 이미 보유한 조건입니다. 23성 이상은 파괴 시 22성 복구 후 재강화 비용까지 포함합니다. 선택한 MVP·PC방 할인과 15~17성 파괴 방지를 반영합니다. 기간 이벤트와 스페어 구매 가격은 포함하지 않으며, 복구표가 없는 장비는 기대 메소를 표시하지 않습니다.</p></div>;
}

export function PotentialView({ items, tierCandidates }) {
  return <div className="analysis-view">
    <div className="view-heading"><div><span className="eyebrow">POTENTIAL</span><h3>잠재능력 강화</h3></div><span>{tierCandidates.length}개 등급 상승 계산 가능</span></div>
    <div className="potential-overview">{items.map((item, index) => <section key={`${item.item_equipment_slot}-${index}`}><header><strong>{item.item_name}</strong><span>{item.item_equipment_slot}</span></header><div><Badge grade={item.potential_option_grade} /><OptionSummary item={item} /></div><div><Badge grade={item.additional_potential_option_grade} /><OptionSummary item={item} additional /></div></section>)}</div>
    {tierCandidates.length > 0 && <>
      <h4 className="subsection-title">등급 상승 참고</h4>
      <div className="tier-table"><div className="tier-head"><span>장비</span><span>구분</span><span>등급</span><span>1회 비용</span><span>상승 확률</span><span>보장 기준</span></div>{tierCandidates.map((candidate, index) => <div className="tier-row" key={`${candidate.slot}-${candidate.potentialType}-${index}`}><strong>{candidate.itemName}<small>Lv. {candidate.equipmentLevel}</small></strong><span>{candidate.potentialType === 'regular' ? '일반' : '에디셔널'}</span><span>{gradeNames[candidate.currentGrade]} → {gradeNames[candidate.nextGrade]}</span><span>{mesos.format(candidate.resetCost)} 메소</span><span>{(candidate.successProbability * 100).toFixed(4).replace(/\.0+$/, '')}%</span><span>{candidate.guaranteeAttempts}회 이내</span></div>)}</div>
    </>}
    <p className="calculation-note">이 참고표는 보장까지 남은 횟수를 반영하지 않습니다. 장비 상세의 공식 옵션표에서 게임에 표시된 남은 횟수와 목표 옵션을 입력하면 함께 계산할 수 있습니다.</p>
  </div>;
}

export function SetsView({ sets }) {
  return <div className="data-panel"><h3>적용 중인 세트 효과</h3>{sets.map((set) => <section className="set-row" key={set.set_name}><div><h4>{set.set_name}</h4><span className="grade">{set.total_set_count}세트</span></div>{set.set_effect_info.map((effect, index) => <p key={index}><Check size={14} />{effect.set_count}세트 · {effect.set_option}</p>)}</section>)}{!sets.length && <p>적용 중인 세트 효과가 없습니다.</p>}</div>;
}
