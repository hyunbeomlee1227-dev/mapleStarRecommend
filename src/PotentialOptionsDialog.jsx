import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, Target, X } from 'lucide-react';

const gradeSlugs = { 레어: 'rare', 에픽: 'epic', 유니크: 'unique', 레전드리: 'legendary' };
const gradeLabels = { rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드리' };
const gradeOrder = ['rare', 'epic', 'unique', 'legendary'];
const partSlugs = {
  무기: 'weapon', 엠블렘: 'emblem', 방패: 'shield', 모자: 'hat', 상의: 'top', 한벌옷: 'overall', 하의: 'bottom', 신발: 'shoes', 장갑: 'gloves', 망토: 'cape', 벨트: 'belt', 어깨장식: 'shoulder', 얼굴장식: 'face', 눈장식: 'eye', 귀고리: 'earrings', 반지: 'ring', 펜던트: 'pendant', 기계심장: 'heart', '기계 심장': 'heart',
};

export function potentialQueryFor(item, type, gradeOverride = null) {
  const grade = gradeOverride ?? gradeSlugs[type === 'regular' ? item?.potential_option_grade : item?.additional_potential_option_grade];
  const equipmentPart = item?.item_equipment_part?.replace(/\d+$/, '');
  let part = partSlugs[equipmentPart];
  if (equipmentPart === '보조무기' || item?.item_equipment_slot === '보조무기') part = /포스실드|소울링/.test(`${item.item_name} ${item.item_equipment_slot}`) ? 'forceShield' : 'secondary';
  const level = Number(item?.item_total_option?.base_equipment_level ?? item?.item_base_option?.base_equipment_level);
  return grade && part && Number.isInteger(level) && level >= 0 && level <= 250 ? { type, grade, part, level } : null;
}

export function canLookupPotentialOptions(item) {
  return Boolean(potentialQueryFor(item, 'regular') || potentialQueryFor(item, 'additional'));
}

function currentPotentialOptions(item, type) {
  const prefix = type === 'regular' ? 'potential_option_' : 'additional_potential_option_';
  const options = [1, 2, 3].map((line) => item?.[`${prefix}${line}`]).filter(Boolean);
  return options.length === 3 ? options : null;
}

const mesos = new Intl.NumberFormat('ko-KR');
const percent = (value) => `${(value * 100).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}%`;

export default function PotentialOptionsDialog({ item, open, onClose }) {
  const dialogRef = useRef(null);
  const calculationControllerRef = useRef(null);
  const [type, setType] = useState('regular');
  const [displayGrade, setDisplayGrade] = useState(null);
  const [result, setResult] = useState({ status: 'idle' });
  const [targetOptions, setTargetOptions] = useState([]);
  const [minimumMatches, setMinimumMatches] = useState(1);
  const [calculation, setCalculation] = useState({ status: 'idle' });
  const regularAvailable = Boolean(potentialQueryFor(item, 'regular'));
  const additionalAvailable = Boolean(potentialQueryFor(item, 'additional'));

  useEffect(() => {
    if (!open) return;
    const initialType = regularAvailable ? 'regular' : 'additional';
    setType(initialType);
    setDisplayGrade(null);
    dialogRef.current?.showModal();
  }, [open, item, regularAvailable]);

  useEffect(() => {
    if (!open) return;
    const query = potentialQueryFor(item, type, displayGrade);
    if (!query) {
      setResult({ status: 'error', message: '이 장비의 부위, 레벨 또는 잠재 등급을 확인할 수 없습니다.' });
      return;
    }
    const controller = new AbortController();
    setResult({ status: 'loading' });
    calculationControllerRef.current?.abort();
    setTargetOptions([]);
    setMinimumMatches(1);
    setCalculation({ status: 'idle' });
    fetch(`/api/rules/potential-options?${new URLSearchParams(query)}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); return body; })
      .then((body) => setResult({ status: 'ready', body }))
      .catch((error) => { if (!controller.signal.aborted) setResult({ status: 'error', message: error.message || '공식 옵션표를 불러오지 못했습니다.' }); });
    return () => controller.abort();
  }, [open, item, type, displayGrade]);

  function close() {
    calculationControllerRef.current?.abort();
    dialogRef.current?.close();
  }

  function toggleTarget(option) {
    setTargetOptions((selected) => selected.includes(option) ? selected.filter((candidate) => candidate !== option) : [...selected, option]);
    setCalculation({ status: 'idle' });
  }

  async function calculateTarget() {
    const currentQuery = potentialQueryFor(item, type);
    const query = potentialQueryFor(item, type, displayGrade);
    if (!currentQuery || !query || targetOptions.length === 0) return;
    calculationControllerRef.current?.abort();
    const controller = new AbortController();
    calculationControllerRef.current = controller;
    setCalculation({ status: 'loading' });
    try {
      const response = await fetch('/api/rules/potential-target-probability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...query,
          grade: currentQuery.grade,
          targetGrade: query.grade,
          targetOptions,
          minimumMatches,
          currentOptions: currentQuery.grade === query.grade ? currentPotentialOptions(item, type) ?? undefined : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      if (!controller.signal.aborted) setCalculation({ status: 'ready', body });
    } catch (error) {
      if (!controller.signal.aborted) setCalculation({ status: 'error', message: error.message || '목표 확률을 계산하지 못했습니다.' });
    }
  }

  const availableOptions = result.status === 'ready'
    ? [...new Set(result.body.lines.flatMap((line) => line.map(({ option }) => option)))]
    : [];
  const currentGrade = potentialQueryFor(item, type)?.grade;
  const selectedGrade = displayGrade ?? currentGrade;
  const availableGrades = currentGrade ? gradeOrder.slice(gradeOrder.indexOf(currentGrade)) : [];

  function switchType(nextType) {
    setType(nextType);
    setDisplayGrade(null);
  }

  return <dialog ref={dialogRef} aria-labelledby="potential-options-title" onClose={onClose} className="potential-options-dialog">
    <div className="dialog-heading"><div><span className="eyebrow">NEXON OFFICIAL DATA</span><h2 id="potential-options-title">공식 잠재 옵션표</h2></div><button className="icon-button" aria-label="공식 잠재 옵션표 닫기" onClick={close}><X /></button></div>
    <div className="potential-toolbar"><div className="mode-control potential-type" role="group" aria-label="잠재 종류"><button disabled={!regularAvailable} className={type === 'regular' ? 'active' : ''} aria-pressed={type === 'regular'} onClick={() => switchType('regular')}>일반</button><button disabled={!additionalAvailable} className={type === 'additional' ? 'active' : ''} aria-pressed={type === 'additional'} onClick={() => switchType('additional')}>에디셔널</button></div>{availableGrades.length > 1 && <div className="mode-control potential-grade" role="group" aria-label="조회 및 목표 등급">{availableGrades.map((grade) => <button key={grade} className={selectedGrade === grade ? 'active' : ''} aria-pressed={selectedGrade === grade} onClick={() => setDisplayGrade(grade)}>{gradeLabels[grade]}</button>)}</div>}</div>
    {result.status === 'loading' && <div className="potential-loading"><LoaderCircle className="spin" />공식 확률표를 불러오는 중입니다.</div>}
    {result.status === 'error' && <div className="potential-error" role="alert">{result.message}</div>}
    {result.status === 'ready' && <><div className="potential-meta"><strong>{item.item_name}</strong><span>{result.body.part} · {result.body.grade} · Lv. {result.body.levelBand}</span>{result.body.cached && <small>캐시됨</small>}</div><div className="potential-lines">{result.body.lines.map((line, index) => <section key={index}><h3>{index + 1}번째 옵션</h3><div>{line.map((entry) => <p key={`${entry.option}-${entry.probability}`}><span>{entry.option}</span><strong>{(entry.probability * 100).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}%</strong></p>)}</div></section>)}</div><section className="potential-target-builder" aria-label="잠재 목표 확률 계산"><div className="potential-target-heading"><div><span className="eyebrow">TARGET OPTIONS</span><h3>{gradeLabels[selectedGrade]} 목표 옵션 확률</h3></div><div className="mode-control" role="group" aria-label="최소 일치 줄 수">{[1, 2, 3].map((count) => <button key={count} className={minimumMatches === count ? 'active' : ''} aria-pressed={minimumMatches === count} onClick={() => { setMinimumMatches(count); setCalculation({ status: 'idle' }); }}>{count}줄 이상</button>)}</div></div><div className="potential-target-options">{availableOptions.map((option) => <label key={option}><input type="checkbox" checked={targetOptions.includes(option)} onChange={() => toggleTarget(option)} /><span>{option}</span></label>)}</div><button className="potential-calculate" disabled={targetOptions.length === 0 || calculation.status === 'loading'} onClick={calculateTarget}>{calculation.status === 'loading' ? <LoaderCircle className="spin" /> : <Target />}목표 확률 계산</button>{calculation.status === 'error' && <div className="potential-error" role="alert">{calculation.message}</div>}{calculation.status === 'ready' && <div className="potential-target-result" aria-label="잠재 목표 계산 결과"><p><span>{calculation.body.alreadySatisfied ? '현재 상태' : '목표 등급 1회 확률'}</span><strong>{calculation.body.alreadySatisfied ? '목표 달성' : percent(calculation.body.probability)}</strong></p><p><span>총 평균 재설정</span><strong>{calculation.body.expectedResets === null ? '달성 불가' : `${calculation.body.expectedResets.toFixed(2)}회`}</strong></p><p><span>총 기대 메소</span><strong>{calculation.body.expectedMeso === null ? '계산 불가' : `${mesos.format(calculation.body.expectedMeso)} 메소`}</strong></p></div>}</section><a className="official-link" href={result.body.sourceUrl} target="_blank" rel="noreferrer">넥슨 공식 확률표 <ArrowUpRight size={13} /></a></>}
    <p className="calculation-note">등급 상승과 목표 등급의 줄별 표기 확률을 합산합니다. 최대 등장 횟수 제한과 현재 등급에서 완전히 동일한 결과의 재추첨을 반영하며, 보장 누적 횟수는 반영하지 않습니다.</p>
  </dialog>;
}
