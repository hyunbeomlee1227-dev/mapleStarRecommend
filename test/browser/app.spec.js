import { test, expect } from '@playwright/test';

test('equipment browsing, filters, detail and status remain usable', async ({ page }, info) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('예시 데이터', { exact: true })).toBeVisible();
  await expect(page.getByLabel('보스', { exact: true })).toHaveValue('유피테르');
  await expect(page.getByLabel('난이도', { exact: true })).toHaveValue('jupiter-hard');
  await page.getByLabel('보스', { exact: true }).selectOption('스우');
  await expect(page.getByLabel('난이도', { exact: true })).toHaveValue('lotus-hard');
  await page.getByLabel('난이도', { exact: true }).selectOption('lotus-extreme');
  await expect(page.getByText('스우 익스트림 기준 강화 우선순위')).toBeVisible();
  await expect(page.getByText('이 보스의 솔로 클리어 기준은 아직 검증 전입니다.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('보스', { exact: true })).toHaveValue('스우');
  await expect(page.getByLabel('난이도', { exact: true })).toHaveValue('lotus-extreme');
  await expect(page.getByRole('button', { name: '에스텔라 이어링 상세 보기' })).toBeVisible();
  await page.getByLabel('장비 검색', { exact: true }).fill('에스텔라');
  await expect(page.locator('.item-row')).toHaveCount(1);
  await page.getByRole('button', { name: '에스텔라 이어링 상세 보기' }).click();
  const detail = info.project.name === 'mobile' ? page.locator('.mobile-detail') : page.locator('.details-panel');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.equipment-tooltip')).toBeVisible();
  await expect(detail.locator('.tooltip-stars svg')).toHaveCount(17);
  await expect(detail.getByRole('heading', { name: '에스텔라 이어링 (+8)' })).toBeVisible();
  await expect(detail.getByText('요구 레벨 Lv. 150', { exact: true })).toBeVisible();
  await expect(detail.locator('[data-stat="str"]')).toContainText('+102');
  await expect(detail.locator('[data-stat="str"]')).toContainText('(30+40+12+20)');
  await expect(detail.getByText('주문서 강화 8회', { exact: false })).toBeVisible();
  await expect(detail.getByText('강화 종류', { exact: true })).toBeVisible();
  await expect(detail.getByText('Open API 미제공', { exact: true })).toBeVisible();
  await expect(detail.locator('.tooltip-scroll-result')).toContainText('STR +12');
  await expect(detail.locator('.tooltip-scroll-result')).toContainText('공격력 +8');
  await expect(detail.getByRole('heading', { name: '잠재능력', exact: true })).toBeVisible();
  await expect(detail.getByRole('heading', { name: '에디셔널 잠재능력', exact: true })).toBeVisible();
  expect(await detail.locator('.equipment-tooltip').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(35, 37, 44)');
  if (info.project.name === 'mobile') await page.getByLabel('장비 상세 닫기').click();
  else await expect(detail.locator('h3')).toHaveText('에스텔라 이어링 (+8)');
  await page.getByLabel('장비 검색', { exact: true }).fill('');
  await page.getByLabel('잠재능력 등급 필터').selectOption('레전드리');
  await expect(page.locator('.item-row')).toHaveCount(5);
  await page.getByRole('tab', { name: '능력치', exact: true }).click();
  await expect(page.locator('.full-stats')).toContainText('38420');
  await page.getByRole('tab', { name: '세트 효과' }).click();
  await expect(page.locator('.set-row')).toContainText('예시 세트 효과');
  await page.getByRole('tab', { name: /^장비/ }).click();
  await page.getByLabel('잠재능력 등급 필터').selectOption('all');
  await expect(page.getByLabel('분석 가능 장비')).toContainText('스타포스 9');
  await page.getByRole('button', { name: '예산 내 추천' }).click();
  await expect(page.getByText('예산을 0보다 큰 억 메소 단위로 입력해 주세요.')).toBeVisible();
  await page.getByLabel('예산 (억 메소)').fill('100');
  await expect(page.getByText('강화 후보 정보는 준비됐지만 비용과 성능 모델 검증 전이라 순위를 제공하지 않습니다.')).toBeVisible();
  await page.getByRole('tab', { name: '잠재능력', exact: true }).click();
  await expect(page.getByText('등급 상승 참고')).toBeVisible();
  await expect(page.getByText('38,250,000 메소').first()).toBeVisible();
  expect(await page.locator('.analysis-tabs').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.locator('.tier-table').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('tab', { name: '스타포스', exact: true }).click();
  await expect(page.getByRole('heading', { name: '스타포스 강화' })).toBeVisible();
  await expect(page.getByText('16.85%', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('3,151,795,078 메소', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('강화 규칙 2/5 검증')).toBeVisible();
  await page.getByText('강화 규칙 2/5 검증').click();
  await expect(page.getByText('2026-09-11-v5 · 2026-09-11')).toBeVisible();
  await expect(page.getByText('잠재 재설정 비용', { exact: true })).toBeVisible();
  await expect(page.getByText('스타포스 기대 비용', { exact: true })).toBeVisible();
  await expect(page.getByText('순위 계산 대기', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('boss equipment goals are shown for the selected solo boss range', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('보스', { exact: true }).selectOption('스우');
  await expect(page.getByLabel('난이도', { exact: true })).toHaveValue('lotus-hard');
  await expect(page.getByRole('heading', { name: '보스별 장비 목표' })).toBeVisible();
  await expect(page.getByText('에스텔라 이어링', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('스타포스 17성 -> 22성', { exact: true })).toBeVisible();
  await page.getByLabel('난이도', { exact: true }).selectOption('lotus-extreme');
  await expect(page.getByText('이 보스 구간에 등록된 장비 목표가 없습니다.')).toBeVisible();
  await expect(page.getByText('관리자 기준', { exact: true })).toHaveCount(0);
});

test('real lookup UI uses server response and recent searches can be deleted', async ({ page }) => {
  await page.route('**/api/character?*', async (route) => {
    const { demo } = await import('../../src/demo.js');
    await route.fulfill({ json: { ...demo, source: 'nexon', date: '2026-09-08', character: { ...demo.character, name: '검증캐릭터', image: null } } });
  });
  await page.goto('/');
  await page.getByLabel('캐릭터 이름', { exact: true }).fill('검증캐릭터');
  await page.getByRole('button', { name: '캐릭터 조회', exact: true }).click();
  await expect(page.locator('.character-identity h2')).toHaveText('검증캐릭터');
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  await page.getByLabel('최근 조회 모두 삭제').click();
  await expect(page.locator('.recent')).toHaveCount(0);
});

test('lookup failures preserve current displayed data and show an error', async ({ page }) => {
  await page.route('**/api/character?*', (route) => route.fulfill({ status: 404, json: { message: '캐릭터를 찾지 못했습니다.' } }));
  await page.goto('/');
  await page.getByLabel('캐릭터 이름', { exact: true }).fill('없는캐릭터');
  await page.getByRole('button', { name: '캐릭터 조회', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('캐릭터를 찾지 못했습니다.');
  await expect(page.locator('.character-identity h2')).toHaveText('예시 히어로');
});

test('selected equipment can load official regular and additional potential option tables', async ({ page }, info) => {
  const requests = [];
  await page.route('**/api/rules/potential-options?*', async (route) => {
    requests.push(new URL(route.request().url()).searchParams.get('type'));
    await route.fulfill({ json: {
      grade: '레전드리', part: '무기', levelBand: '120~200', sourceUrl: 'https://maplestory.nexon.com/Guide/OtherProbability/cube/black', cached: false,
      lines: [
        [{ option: '보스 몬스터 공격 시 데미지 +40%', probability: 0.1 }],
        [{ option: '공격력 +12%', probability: 0.02 }],
        [{ option: '몬스터 방어율 무시 +40%', probability: 0.005 }],
      ],
    } });
  });
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '아케인셰이드 투핸드소드 상세 보기' }).click();
  await page.getByRole('button', { name: '공식 잠재 옵션표 보기' }).click();
  await expect(page.getByRole('dialog', { name: '공식 잠재 옵션표' })).toBeVisible();
  await expect(page.locator('dialog:open')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '공식 잠재 옵션표' }).getByText('보스 몬스터 공격 시 데미지 +40%')).toBeVisible();
  await page.screenshot({ path: `test-results/potential-options-${info.project.name}.png`, fullPage: true });
  expect(await page.getByRole('dialog', { name: '공식 잠재 옵션표' }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '에디셔널' }).click();
  await expect.poll(() => requests).toEqual(['regular', 'additional']);
  await page.getByLabel('공식 잠재 옵션표 닫기').click();
  if (info.project.name === 'mobile') await expect(page.getByLabel('장비 상세 닫기')).toBeVisible();
});

test('equipment analysis separates Maple upgrade views and preserves duplicate rings', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /^장비/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: '업그레이드', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '스타포스', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '잠재능력', exact: true })).toBeVisible();
  await expect(page.locator('.item-row .item-identity small').filter({ hasText: /^반지/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '메달 상세 보기' }).locator('.star-value')).toHaveCount(0);
  await expect(page.getByLabel('캐릭터 요약')).toContainText('보스 데미지');
  await expect(page.getByLabel('캐릭터 요약')).toContainText('320%');

  await page.getByRole('tab', { name: '업그레이드', exact: true }).click();
  await expect(page.getByRole('heading', { name: '장비 업그레이드' })).toBeVisible();
  await page.screenshot({ path: `test-results/upgrade-${info.project.name}.png`, fullPage: true });
  await page.getByRole('tab', { name: '스타포스', exact: true }).click();
  await expect(page.getByRole('heading', { name: '스타포스 강화' })).toBeVisible();
  await expect(page.getByText('메달', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '잠재능력', exact: true }).click();
  await expect(page.getByRole('heading', { name: '잠재능력 강화' })).toBeVisible();
  await page.screenshot({ path: `test-results/potential-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
