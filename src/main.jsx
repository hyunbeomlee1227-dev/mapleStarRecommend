import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Star, ArrowUpRight, ArrowUpDown, ChevronRight, X, Trash2, CircleHelp, Layers3, Swords, Shield, Gem, Clock3, SlidersHorizontal, AlertCircle, LoaderCircle, FlaskConical, Target, Wrench } from 'lucide-react';
import { demo } from './demo';
import { readRecent, saveRecent, clearRecent } from './storage';
import PotentialOptionsDialog from './PotentialOptionsDialog';
import { PotentialView, SetsView, StarforceView, UpgradeView, supportsStarforce } from './AnalysisViews';
import EquipmentTooltip from './EquipmentTooltip';
import './style.css';

const grades = { 레전드리: 'legendary', 유니크: 'unique', 에픽: 'epic', 레어: 'rare' };
function Badge({ grade }) { return <span className={`grade ${grades[grade] || ''}`}>{grade || '정보 없음'}</span>; }
function EquipmentIcon({ item }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.item_icon]);
  return <span className="item-icon">{item.item_icon && !failed ? <img src={item.item_icon} alt="" onError={() => setFailed(true)} /> : item.item_equipment_part === '무기' ? <Swords /> : item.item_equipment_part?.includes('반지') || item.item_equipment_part === '귀고리' ? <Gem /> : <Shield />}</span>;
}
function App() {
  const [data, setData] = useState(demo);
  const [name, setName] = useState('');
  const [recent, setRecent] = useState(() => readRecent());
  const [connection, setConnection] = useState('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [grade, setGrade] = useState('all');
  const [sort, setSort] = useState('slot');
  const [tab, setTab] = useState('equipment');
  const [selected, setSelected] = useState(demo.items[0]);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [help, setHelp] = useState(false);
  const [goals, setGoals] = useState({ goals: [], defaultGoalId: null, version: '' });
  const [goalId, setGoalId] = useState('');
  const [assessment, setAssessment] = useState({ status: 'loading', message: '보스 목표를 불러오는 중입니다.' });
  const [recommendationMode, setRecommendationMode] = useState('all');
  const [budget, setBudget] = useState('');
  const [recommendation, setRecommendation] = useState({ status: 'loading', message: '추천 조건을 준비하는 중입니다.' });
  const [rules, setRules] = useState({ version: null, updatedAt: null, capabilities: {}, summary: { verified: 0, total: 0 } });
  const [potentialOptionsOpen, setPotentialOptionsOpen] = useState(false);
  const [potentialReturnToDetail, setPotentialReturnToDetail] = useState(false);
  const abort = useRef(null);
  const helpRef = useRef(null);
  const detailRef = useRef(null);
  const isDemo = data.source === 'demo';
  useEffect(() => {
    fetch('/api/status').then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((result) => setConnection(result.configured ? 'ready' : 'unconfigured')).catch(() => setConnection('offline'));
    fetch('/api/goals').then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((result) => {
      setGoals(result);
      let saved = null;
      try {
        saved = localStorage.getItem('maple-star:goal:v1');
      } catch {
        // The app still works when browser storage is unavailable.
      }
      setGoalId(result.goals.some((goal) => goal.id === saved) ? saved : (result.defaultGoalId || ''));
    }).catch(() => setAssessment({ status: 'unavailable', message: '보스 목표를 불러오지 못했습니다.' }));
    fetch('/api/rules').then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then(setRules).catch(() => {});
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!goalId || !data.combat) return;
    try { localStorage.setItem('maple-star:goal:v1', goalId); } catch { /* Goal selection remains usable without storage. */ }
    const controller = new AbortController();
    setAssessment({ status: 'loading', message: '목표 기준을 확인하는 중입니다.' });
    fetch('/api/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, combat: data.combat }), signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then(setAssessment)
      .catch((error) => { if (!controller.signal.aborted) setAssessment({ status: 'unavailable', message: error.message || '목표 판정을 불러오지 못했습니다.' }); });
    return () => controller.abort();
  }, [goalId, data]);
  useEffect(() => {
    if (!goalId || !data.combat) return;
    const setRecommendationStatus = (status, message) => setRecommendation((current) => ({
      status,
      message,
      ...(current.jobEquipmentReference?.job === data.character.job
        ? { jobEquipmentReference: current.jobEquipmentReference }
        : {}),
    }));
    let budgetMesos = null;
    if (recommendationMode === 'budget') {
      const amount = Number(budget);
      if (!budget || !Number.isFinite(amount) || amount <= 0 || amount > 90000000) {
        setRecommendationStatus('input-required', '예산을 0보다 큰 억 메소 단위로 입력해 주세요.');
        return;
      }
      budgetMesos = Math.round(amount * 100000000);
    }
    const controller = new AbortController();
    setRecommendationStatus('loading', '강화 후보를 확인하는 중입니다.');
    const items = data.items.map(({ item_name, item_equipment_slot, item_equipment_part, item_total_option, item_base_option, starforce, special_ring_level, potential_option_grade, additional_potential_option_grade }) => ({
      item_name,
      item_equipment_slot,
      item_equipment_part,
      baseEquipmentLevel: Number(item_total_option?.base_equipment_level ?? item_base_option?.base_equipment_level) || null,
      starforce,
      special_ring_level,
      potential_option_grade,
      additional_potential_option_grade,
    }));
    fetch('/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, characterJob: data.character.job, mode: recommendationMode, budgetMesos, combat: data.combat, items }), signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then(setRecommendation)
      .catch((error) => { if (!controller.signal.aborted) setRecommendationStatus('unavailable', error.message || '추천 조건을 확인하지 못했습니다.'); });
    return () => controller.abort();
  }, [goalId, data, recommendationMode, budget]);
  useEffect(() => { if (help) helpRef.current?.showModal(); else helpRef.current?.close(); }, [help]);
  useEffect(() => { if (mobileDetail) detailRef.current?.showModal(); else detailRef.current?.close(); }, [mobileDetail]);
  async function lookup(event, candidate = name) {
    event?.preventDefault();
    const query = candidate.trim();
    if (!/^[\p{L}\p{N}]{1,12}$/u.test(query)) { setError('캐릭터 이름은 한글·영문·숫자 1~12자로 입력해 주세요.'); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true); setError(''); setName(query);
    try {
      const response = await fetch(`/api/character?name=${encodeURIComponent(query)}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '캐릭터를 조회하지 못했습니다.');
      if (controller.signal.aborted) return;
      setRecommendation({ status: 'loading', message: '직업별 장비 표본을 확인하는 중입니다.' });
      setData(result); setSelected(result.items[0] || null); setFilter(''); setGrade('all'); setTab('equipment');
      setRecent(saveRecent(query)); setConnection('ready');
    } catch (error) { if (!controller.signal.aborted) setError(error.message || '연결을 확인한 뒤 다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function showDemo() {
    abort.current?.abort(); setLoading(false); setError('');
    setRecommendation({ status: 'loading', message: '직업별 장비 표본을 확인하는 중입니다.' });
    setData(demo); setSelected(demo.items[0]); setFilter(''); setGrade('all'); setTab('equipment');
  }
  const items = data.items.filter((item) => `${item.item_name} ${item.item_equipment_slot}`.includes(filter) && (grade === 'all' || item.potential_option_grade === grade));
  if (sort === 'stars') items.sort((a, b) => Number(b.starforce || 0) - Number(a.starforce || 0));
  const starTotal = data.items.filter(supportsStarforce).reduce((sum, item) => sum + (Number(item.starforce) || 0), 0);
  const bossDamage = data.combat?.values?.bossDamage;
  const selectedGoal = goals.goals.find((goal) => goal.id === goalId);
  const bosses = [...new Set(goals.goals.map((goal) => goal.boss))];
  const difficultyGoals = goals.goals.filter((goal) => goal.boss === selectedGoal?.boss);
  const tierCandidates = recommendation.supportedCalculations?.potentialTierUpgrades ?? [];
  const starforceRisks = recommendation.supportedCalculations?.starforceRisks ?? [];
  const equipmentRecommendations = recommendation.equipmentRecommendations ?? [];
  const jobEquipmentReference = recommendation.jobEquipmentReference;
  function selectBoss(boss) {
    const candidates = goals.goals.filter((goal) => goal.boss === boss);
    const matchingDifficulty = candidates.find((goal) => goal.difficulty === selectedGoal?.difficulty);
    setGoalId((matchingDifficulty ?? candidates.at(-1))?.id ?? '');
  }
  function openPotentialOptions() {
    setPotentialReturnToDetail(mobileDetail);
    if (mobileDetail) setMobileDetail(false);
    setPotentialOptionsOpen(true);
  }
  function closePotentialOptions() {
    setPotentialOptionsOpen(false);
    if (potentialReturnToDetail) setMobileDetail(true);
    setPotentialReturnToDetail(false);
  }
  function displaySlot(item) {
    const matching = data.items.filter((candidate) => candidate.item_equipment_slot === item.item_equipment_slot);
    if (matching.length < 2) return item.item_equipment_slot;
    return `${item.item_equipment_slot} ${matching.indexOf(item) + 1}`;
  }
  const detail = selected ? <EquipmentTooltip item={selected} characterJob={data.character.job} onOpenPotentialOptions={openPotentialOptions} /> : <p className="muted">조회된 장비가 없습니다.</p>;
  return <>
    <header className="header"><div className="header-inner"><a className="brand" href="/" aria-label="메이플 스타 홈"><span className="brand-symbol"><Star size={21} fill="currentColor" /></span>메이플<span>스타</span></a><span className="header-divider" /><span className="header-page">장비 분석</span><div className="header-right"><span className="region">KMS · 한국 메이플스토리</span><button className="icon-button" aria-label="서비스 정보" title="서비스 정보" onClick={() => setHelp(true)}><CircleHelp size={19} /></button></div></div></header>
    <main className="workspace">
      <div className="page-heading"><div><div className="eyebrow">CHARACTER EQUIPMENT</div><h1>내 장비, 한눈에.</h1><p>스타포스부터 잠재능력까지, 현재 장비를 확인하세요.</p></div><span className="version">장비 조회 · 첫 버전</span></div>
      <section className="search-section" aria-label="캐릭터 조회"><form className="search-form" onSubmit={lookup}><Search size={20} /><input aria-label="캐릭터 이름" placeholder="캐릭터 이름을 입력해 주세요" value={name} onChange={(event) => setName(event.target.value)} maxLength={12} autoComplete="off" /><button className="primary" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}{loading ? '조회 중' : '캐릭터 조회'}</button></form><div className="search-meta"><span className={`connection ${connection === 'ready' ? 'ready' : ''}`}><i />{connection === 'ready' ? '캐릭터 조회 연결됨' : connection === 'checking' ? '연결 확인 중' : connection === 'offline' ? '서버 연결 확인 필요' : '예시 보기 이용 가능'}</span><button className="text-button" onClick={showDemo}><FlaskConical size={14} />예시 캐릭터 보기</button></div>
      {recent.length > 0 && <div className="recent"><Clock3 size={14} /><span>최근 조회</span>{recent.map((entry) => <button key={entry.name} onClick={() => lookup(null, entry.name)}>{entry.name}</button>)}<button className="icon-button" title="최근 조회 모두 삭제" aria-label="최근 조회 모두 삭제" onClick={() => { clearRecent(); setRecent([]); }}><Trash2 size={14} /></button></div>}
      {error && <div className="error" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="icon-button" aria-label="오류 닫기" onClick={() => setError('')}><X size={16} /></button></div>}</section>
      {isDemo && <div className="demo-banner"><FlaskConical size={16} /><span><strong>예시 데이터</strong> 실제 캐릭터와 무관한 화면 확인용 장비입니다.</span></div>}
      <section className="goal-panel" aria-label="솔로 클리어 목표 설정"><div className="goal-heading"><span className="goal-icon"><Target size={19} /></span><div><span>솔로 클리어 목표</span><strong>{selectedGoal ? `${selectedGoal.boss} · ${selectedGoal.difficulty}` : '목표 불러오는 중'}</strong></div></div><div className="goal-controls"><label><span>보스</span><select aria-label="보스" value={selectedGoal?.boss ?? ''} onChange={(event) => selectBoss(event.target.value)} disabled={!bosses.length}>{bosses.map((boss) => <option key={boss} value={boss}>{boss}</option>)}</select></label><label><span>난이도</span><select aria-label="난이도" value={goalId} onChange={(event) => setGoalId(event.target.value)} disabled={!difficultyGoals.length}>{difficultyGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.difficulty}</option>)}</select></label></div><div className="goal-state"><span className={`state-dot ${assessment.status}`} />{assessment.status === 'loading' ? '확인 중' : assessment.status === 'benchmark-pending' ? '솔로 기준 검증 중' : assessment.status === 'insufficient-data' ? '능력치 부족' : '판정 준비 중'}</div></section>
      <section className="character-strip" aria-label="캐릭터 요약"><div className="character-identity"><div className="portrait">{data.character.image ? <img src={data.character.image} alt={isDemo ? '메이플스토리 안내 캐릭터' : `${data.character.name} 캐릭터`} onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <Shield size={30} />}</div><div><span className="character-meta">{data.character.world} <span>·</span> Lv. {data.character.level}</span><h2>{data.character.name}</h2><span className="job"><Swords size={13} />{data.character.job}</span></div></div><div className="summary-stat"><span>착용 장비</span><strong>{data.items.length}<small>개</small></strong></div><div className="summary-stat"><span>스타포스 합계</span><strong><Star size={17} className="gold" />{starTotal}<small>성</small></strong></div><div className="summary-stat"><span>레전드리 잠재</span><strong>{data.items.filter((item) => item.potential_option_grade === '레전드리').length}<small>개</small></strong></div><div className="summary-stat boss-stat"><span>보스 데미지</span><strong>{Number.isFinite(bossDamage) ? `${bossDamage}%` : '-'} </strong></div><div className="snapshot"><Clock3 size={14} /><span>{isDemo ? '예시 장비 프리셋' : `${data.date} 기준 (KST)`}<small>{data.preset ? `프리셋 ${data.preset}` : '프리셋 정보 없음'}{data.presetSelection?.status === 'selected' ? ' · 보스 옵션 자동 선택' : data.presetSelection?.status === 'farming-fallback' ? ' · 사냥 옵션 포함' : ''}{data.cached ? ' · 캐시된 조회' : ''}</small></span></div></section>
      <div className="tabs analysis-tabs" role="tablist" aria-label="장비 분석 보기">{[['equipment', '장비', Layers3], ['upgrade', '업그레이드', Wrench], ['starforce', '스타포스', Star], ['potential', '잠재능력', SlidersHorizontal], ['stats', '능력치', SlidersHorizontal], ['sets', '세트 효과', Shield]].map(([id, text, Icon]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}><Icon size={16} />{text}{id === 'equipment' && <span className="count">{data.items.length}</span>}</button>)}</div>
      <div className={`content-grid ${tab === 'equipment' ? '' : 'single-panel'}`}><section className="main-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'equipment' ? <><div className="table-toolbar"><label className="filter"><Search size={16} /><input aria-label="장비 검색" placeholder="장비명 또는 부위 검색" value={filter} onChange={(event) => setFilter(event.target.value)} /></label><div className="table-controls"><select aria-label="잠재능력 등급 필터" value={grade} onChange={(event) => setGrade(event.target.value)}><option value="all">모든 잠재 등급</option>{Object.keys(grades).map((g) => <option key={g}>{g}</option>)}</select><button className="sort" title={sort === 'slot' ? '스타포스 높은 순 정렬' : '장비 순서로 정렬'} onClick={() => setSort(sort === 'slot' ? 'stars' : 'slot')}><ArrowUpDown size={14} />{sort === 'slot' ? '기본순' : '스타포스순'}</button></div></div><div className="equipment-table"><div className="table-head"><span>장비</span><span>스타포스</span><span>잠재능력</span><span>에디셔널</span><span /></div>{items.map((item, index) => <button className={`item-row ${selected === item ? 'selected' : ''}`} key={`${item.item_equipment_slot}-${item.item_name}-${index}`} onClick={() => { setSelected(item); if (matchMedia('(max-width: 1000px)').matches) setMobileDetail(true); }} aria-label={`${item.item_name} 상세 보기`}><span className="item-identity"><EquipmentIcon item={item} /><span><small>{displaySlot(item)}</small><strong>{item.item_name}</strong></span></span>{supportsStarforce(item) ? <span className="star-value"><Star size={12} fill="currentColor" />{item.starforce}</span> : <span className="not-applicable">-</span>}<Badge grade={item.potential_option_grade} /><Badge grade={item.additional_potential_option_grade} /><ChevronRight size={15} className="row-arrow" /></button>)}</div>{items.length === 0 && <div className="empty"><Search size={28} /><h3>표시할 장비가 없습니다</h3><p>검색어와 등급 필터를 확인해 주세요.</p><button className="text-button" onClick={() => { setFilter(''); setGrade('all'); }}>필터 초기화</button></div>}<div className="table-footer">{items.length}개 장비 표시 <span>장비를 선택하면 강화 수치를 구분해 확인할 수 있습니다.</span></div></> : tab === 'upgrade' ? <UpgradeView items={data.items} /> : tab === 'starforce' ? <StarforceView risks={starforceRisks} /> : tab === 'potential' ? <PotentialView items={data.items} tierCandidates={tierCandidates} /> : tab === 'stats' ? <div className="data-panel"><h3>캐릭터 능력치</h3><dl className="full-stats">{data.stats.map((stat) => <div key={stat.stat_name}><dt>{stat.stat_name}</dt><dd>{stat.stat_value}</dd></div>)}</dl>{!data.stats.length && <p>조회된 능력치가 없습니다.</p>}</div> : <SetsView sets={data.sets} />}
      </section>{tab === 'equipment' && <aside className="details-panel">{detail}</aside>}</div>
      <section className="recommendation-status" aria-label="강화 추천 조건"><div className="recommendation-heading"><div className="status-icon"><SlidersHorizontal size={21} /></div><div><h3>{selectedGoal ? `${selectedGoal.boss} ${selectedGoal.difficulty} 기준 강화 우선순위` : '강화 우선순위'}</h3><p>{assessment.message}</p><p className="model-message">{recommendation.message}</p></div></div><div className="recommendation-inputs"><div className="mode-control" role="group" aria-label="추천 범위"><button className={recommendationMode === 'all' ? 'active' : ''} aria-pressed={recommendationMode === 'all'} onClick={() => setRecommendationMode('all')}>전체 추천</button><button className={recommendationMode === 'budget' ? 'active' : ''} aria-pressed={recommendationMode === 'budget'} onClick={() => setRecommendationMode('budget')}>예산 내 추천</button></div>{recommendationMode === 'budget' && <label className="budget-input"><span>예산</span><input aria-label="예산 (억 메소)" type="number" min="0.1" max="90000000" step="0.1" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} /><span>억 메소</span></label>}</div>{recommendation.coverage && <div className="coverage" aria-label="분석 가능 장비"><span>스타포스 {recommendation.coverage.starforce}</span><span>잠재 {recommendation.coverage.potential}</span><span>에디셔널 {recommendation.coverage.additionalPotential}</span></div>}<span className="pending-badge">{recommendation.status === 'loading' ? '확인 중' : '순위 계산 대기'}</span></section>
      <section className="equipment-recommendations" aria-label="일반 직업군 장비 목표"><div className="equipment-recommendation-heading"><div><span>GENERAL JOB EQUIPMENT TARGET</span><h3>일반 직업군 장비 목표</h3></div>{recommendationMode === 'budget' && <span className="budget-not-applied-token">예산 필터 미적용</span>}</div>
        {recommendation.status === 'loading' ? <p className="recommendation-empty">장비 목표를 확인하는 중입니다.</p> : equipmentRecommendations.length ? <div className="equipment-recommendation-list">{equipmentRecommendations.map((item) => <article key={`${item.ruleId}:${item.slot}:${item.itemName}`}><div className="equipment-recommendation-item"><div><small>{item.slot}</small><strong>{item.itemName}</strong></div><span>{item.actions.join(', ')}</span></div><p>{item.reason}</p></article>)}</div> : <p className="recommendation-empty">이 보스 구간에 등록된 장비 목표가 없습니다.</p>}
        <p className="recommendation-note">{recommendation.equipmentTargetTrace?.version || '목표 규칙 불러오는 중'} · 일반 직업의 공통 장비군 기준이며 최종뎀 및 메소당 효율 순위는 아직 적용되지 않습니다.</p>
      </section>
      <section className="job-equipment-reference" aria-label="같은 직업 장비 관측"><div className="equipment-recommendation-heading"><div><span>OFFICIAL RANKING OBSERVATION</span><h3>{data.character.job} 장비 사용 참고</h3></div>{jobEquipmentReference?.status === 'available' && <span className="observation-token">표본 {jobEquipmentReference.sampleSize}명</span>}</div>
        {recommendation.status === 'loading' ? <p className="recommendation-empty">직업별 장비 표본을 확인하는 중입니다.</p> : jobEquipmentReference?.status === 'available' && jobEquipmentReference.slots.length ? <div className="job-reference-list">{jobEquipmentReference.slots.map((entry) => <article key={entry.slot}><div><small>{entry.slot}</small><strong>{entry.equippedItems.join(' · ')}</strong></div><ul>{entry.observed.map((observed) => { const equipped = entry.equippedItems.includes(observed.itemName); return <li key={observed.itemName} className={equipped ? 'equipped' : ''}><span>{observed.itemName}</span><small>{observed.count}회 관측{equipped ? ' · 현재 장비' : ''}</small></li>; })}</ul></article>)}</div> : <p className="recommendation-empty">이 직업의 균등 표본은 아직 준비되지 않았습니다.</p>}
        <p className="recommendation-note">{jobEquipmentReference?.status === 'available' ? `${jobEquipmentReference.date} · ${jobEquipmentReference.version}` : '직업별 표본 준비 중'} · NEXON 공식 종합 랭킹의 익명 장비 사용 빈도이며 성능·가격·강화 우선순위를 뜻하지 않습니다.</p>
      </section>
      <details className="rule-status"><summary>강화 규칙 {rules.summary.verified}/{rules.summary.total} 검증</summary><div><span className="rule-version">{rules.version || '불러오는 중'} · {rules.updatedAt || '기준일 확인 중'}</span>{Object.entries(rules.capabilities).map(([id, capability]) => <p key={id}><strong className={['rule-', capability.status].join('')}>{capability.status === 'verified' ? '검증' : capability.status === 'partial' ? '부분' : '미지원'}</strong><span>{capability.label}</span><small>{capability.message}</small></p>)}</div></details>
      <footer><span>메이플 스타</span><a href="https://openapi.nexon.com/ko/game/maplestory/" target="_blank" rel="noreferrer">Data based on NEXON Open API <ArrowUpRight size={12} /></a><span>넥슨 공식 서비스가 아닙니다.</span></footer>
    </main>
    <dialog ref={helpRef} onClose={() => setHelp(false)} className="help-dialog"><div className="dialog-heading"><h2>서비스 정보</h2><button className="icon-button" aria-label="서비스 정보 닫기" onClick={() => setHelp(false)}><X /></button></div><p>회원가입 없이 캐릭터 장비를 확인할 수 있습니다. 조회 정보는 완료된 전일 데이터를 기준으로 하며, 오전 2시 이전에는 전전일 데이터를 사용합니다.</p><p>최근 조회한 이름은 이 브라우저에 최대 29일간 저장되며 직접 삭제할 수 있습니다. 예시 캐릭터는 실제 게임 데이터가 아닙니다.</p><p>잠재 등급 상승, 공식 줄별 옵션 확률과 기본 조건의 스타포스 기대 비용은 참고값을 제공합니다. 직업별 최종뎀 순위, 구매 비교와 이미지 분석은 아직 준비 중입니다.</p></dialog>
    <dialog ref={detailRef} onClose={() => setMobileDetail(false)} className="mobile-detail"><div className="dialog-heading"><span>장비 정보</span><button className="icon-button" aria-label="장비 상세 닫기" onClick={() => setMobileDetail(false)}><X /></button></div>{detail}</dialog>
    <PotentialOptionsDialog item={selected} open={potentialOptionsOpen} onClose={closePotentialOptions} />
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
