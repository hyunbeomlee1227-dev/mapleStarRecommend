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
  await expect(page.getByText('이 보스의 솔로 클리어 기준은 아직 관리자 검증 전입니다.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('보스', { exact: true })).toHaveValue('스우');
  await expect(page.getByLabel('난이도', { exact: true })).toHaveValue('lotus-extreme');
  await expect(page.getByRole('button', { name: '에스텔라 이어링 상세 보기' })).toBeVisible();
  await page.getByLabel('장비 검색', { exact: true }).fill('에스텔라');
  await expect(page.locator('.item-row')).toHaveCount(1);
  await page.getByRole('button', { name: '에스텔라 이어링 상세 보기' }).click();
  if (info.project.name === 'mobile') { await expect(page.locator('.mobile-detail')).toBeVisible(); await page.getByLabel('장비 상세 닫기').click(); }
  else await expect(page.locator('.details-panel h3')).toHaveText('에스텔라 이어링');
  await page.getByLabel('장비 검색', { exact: true }).fill('');
  await page.getByLabel('잠재능력 등급 필터').selectOption('레전드리');
  await expect(page.locator('.item-row')).toHaveCount(5);
  await page.getByRole('tab', { name: '캐릭터 능력치' }).click();
  await expect(page.locator('.full-stats')).toContainText('38420');
  await page.getByRole('tab', { name: '세트 효과' }).click();
  await expect(page.locator('.set-row')).toContainText('예시 세트 효과');
  await page.getByRole('tab', { name: '장비 목록' }).click();
  await page.getByLabel('잠재능력 등급 필터').selectOption('all');
  await expect(page.getByLabel('분석 가능 장비')).toContainText('스타포스 10');
  await page.getByRole('button', { name: '예산 내 추천' }).click();
  await expect(page.getByText('예산을 0보다 큰 억 메소 단위로 입력해 주세요.')).toBeVisible();
  await page.getByLabel('예산 (억 메소)').fill('100');
  await expect(page.getByText('강화 후보 정보는 준비됐지만 비용과 성능 모델 검증 전이라 순위를 제공하지 않습니다.')).toBeVisible();
  await expect(page.getByText('강화 규칙 1/4 검증')).toBeVisible();
  await page.getByText('강화 규칙 1/4 검증').click();
  await expect(page.getByText('2026-09-11-v1 · 2026-09-11')).toBeVisible();
  await expect(page.getByText('잠재 재설정 비용', { exact: true })).toBeVisible();
  await expect(page.getByText('스타포스 기대 비용', { exact: true })).toBeVisible();
  await expect(page.getByText('추천 미제공', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
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
