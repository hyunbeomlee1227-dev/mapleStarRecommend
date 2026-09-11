const STAT_NAMES = {
  minAttack: '최소 스탯공격력',
  maxAttack: '최대 스탯공격력',
  damage: '데미지',
  bossDamage: '보스 몬스터 데미지',
  finalDamage: '최종 데미지',
  ignoreDefense: '방어율 무시',
  criticalRate: '크리티컬 확률',
  criticalDamage: '크리티컬 데미지',
  combatPower: '전투력',
  arcaneForce: '아케인포스',
  authenticForce: '어센틱포스',
};

function numberFromStat(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll(',', '').replace('%', '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildCombatSnapshot(stats) {
  const byName = new Map(stats.map((stat) => [stat.stat_name, stat.stat_value]));
  const values = Object.fromEntries(
    Object.entries(STAT_NAMES).map(([key, name]) => [key, numberFromStat(byName.get(name))]),
  );
  const required = ['maxAttack', 'damage', 'bossDamage', 'finalDamage', 'ignoreDefense', 'criticalDamage'];
  const missing = required.filter((key) => values[key] === null);
  return {
    values,
    readiness: missing.length === 0 ? 'snapshot-ready' : 'missing-stats',
    missing,
    damageEstimate: null,
    message: missing.length
      ? '보스전 비교에 필요한 능력치가 일부 없습니다.'
      : '능력치 스냅샷을 확인했습니다. 직업별 전투식 검증 후 예상 최종뎀을 계산합니다.',
  };
}

export function assessGoal(snapshot, goal) {
  if (!goal) return { status: 'unknown-goal', message: '지원하는 목표 보스를 선택해 주세요.' };
  if (snapshot.readiness !== 'snapshot-ready') return { status: 'insufficient-data', message: snapshot.message };
  if (goal.benchmark.status !== 'calibrated') {
    return {
      status: 'benchmark-pending',
      message: '이 보스의 솔로 클리어 기준은 아직 검증 전입니다.',
    };
  }
  return { status: 'model-pending', message: '직업별 전투 모델 검증 전에는 목표 충족 여부를 판정하지 않습니다.' };
}

export { numberFromStat };
