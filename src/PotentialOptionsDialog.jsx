import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, X } from 'lucide-react';

const gradeSlugs = { 레어: 'rare', 에픽: 'epic', 유니크: 'unique', 레전드리: 'legendary' };
const partSlugs = {
  무기: 'weapon', 엠블렘: 'emblem', 방패: 'shield', 모자: 'hat', 상의: 'top', 한벌옷: 'overall', 하의: 'bottom', 신발: 'shoes', 장갑: 'gloves', 망토: 'cape', 벨트: 'belt', 어깨장식: 'shoulder', 얼굴장식: 'face', 눈장식: 'eye', 귀고리: 'earrings', 반지: 'ring', 펜던트: 'pendant', 기계심장: 'heart', '기계 심장': 'heart',
};

function queryFor(item, type) {
  const grade = gradeSlugs[type === 'regular' ? item?.potential_option_grade : item?.additional_potential_option_grade];
  const equipmentPart = item?.item_equipment_part?.replace(/\d+$/, '');
  let part = partSlugs[equipmentPart];
  if (equipmentPart === '보조무기') part = /포스실드|소울링/.test(`${item.item_name} ${item.item_equipment_slot}`) ? 'forceShield' : 'secondary';
  const level = Number(item?.item_total_option?.base_equipment_level ?? item?.item_base_option?.base_equipment_level);
  return grade && part && Number.isInteger(level) && level >= 0 && level <= 250 ? { type, grade, part, level } : null;
}

export function canLookupPotentialOptions(item) {
  return Boolean(queryFor(item, 'regular') || queryFor(item, 'additional'));
}

export default function PotentialOptionsDialog({ item, open, onClose }) {
  const dialogRef = useRef(null);
  const [type, setType] = useState('regular');
  const [result, setResult] = useState({ status: 'idle' });
  const regularAvailable = Boolean(queryFor(item, 'regular'));
  const additionalAvailable = Boolean(queryFor(item, 'additional'));

  useEffect(() => {
    if (!open) return;
    setType(regularAvailable ? 'regular' : 'additional');
    dialogRef.current?.showModal();
  }, [open, item, regularAvailable]);

  useEffect(() => {
    if (!open) return;
    const query = queryFor(item, type);
    if (!query) {
      setResult({ status: 'error', message: '이 장비의 부위, 레벨 또는 잠재 등급을 확인할 수 없습니다.' });
      return;
    }
    const controller = new AbortController();
    setResult({ status: 'loading' });
    fetch(`/api/rules/potential-options?${new URLSearchParams(query)}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); return body; })
      .then((body) => setResult({ status: 'ready', body }))
      .catch((error) => { if (!controller.signal.aborted) setResult({ status: 'error', message: error.message || '공식 옵션표를 불러오지 못했습니다.' }); });
    return () => controller.abort();
  }, [open, item, type]);

  function close() {
    dialogRef.current?.close();
  }

  return <dialog ref={dialogRef} aria-labelledby="potential-options-title" onClose={onClose} className="potential-options-dialog">
    <div className="dialog-heading"><div><span className="eyebrow">NEXON OFFICIAL DATA</span><h2 id="potential-options-title">공식 잠재 옵션표</h2></div><button className="icon-button" aria-label="공식 잠재 옵션표 닫기" onClick={close}><X /></button></div>
    <div className="mode-control potential-type" role="group" aria-label="잠재 종류"><button disabled={!regularAvailable} className={type === 'regular' ? 'active' : ''} aria-pressed={type === 'regular'} onClick={() => setType('regular')}>일반</button><button disabled={!additionalAvailable} className={type === 'additional' ? 'active' : ''} aria-pressed={type === 'additional'} onClick={() => setType('additional')}>에디셔널</button></div>
    {result.status === 'loading' && <div className="potential-loading"><LoaderCircle className="spin" />공식 확률표를 불러오는 중입니다.</div>}
    {result.status === 'error' && <div className="potential-error" role="alert">{result.message}</div>}
    {result.status === 'ready' && <><div className="potential-meta"><strong>{item.item_name}</strong><span>{result.body.part} · {result.body.grade} · Lv. {result.body.levelBand}</span>{result.body.cached && <small>캐시됨</small>}</div><div className="potential-lines">{result.body.lines.map((line, index) => <section key={index}><h3>{index + 1}번째 옵션</h3><div>{line.map((entry) => <p key={`${entry.option}-${entry.probability}`}><span>{entry.option}</span><strong>{(entry.probability * 100).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}%</strong></p>)}</div></section>)}</div><a className="official-link" href={result.body.sourceUrl} target="_blank" rel="noreferrer">넥슨 공식 확률표 <ArrowUpRight size={13} /></a></>}
    <p className="calculation-note">각 줄의 표기 확률입니다. 옵션 중복 제한과 동일 결과 재추첨을 반영한 목표 조합 확률은 아직 계산하지 않습니다.</p>
  </dialog>;
}
