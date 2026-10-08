import { expect, test } from '@playwright/test';

test('loads with no console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('application', { name: /circuit canvas/i })).toBeVisible();
  expect(problems).toEqual([]);
});

test('shows the tutorial on first visit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: /Tutorial: Welcome to DigitalBox/ })).toBeVisible();
});

test('the toolbox lists at least 40 parts', async ({ page }) => {
  await page.goto('/');
  const count = await page.getByTestId('tool-item').count();
  expect(count).toBeGreaterThanOrEqual(40);
});

test('the Half adder example loads onto the canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Half adder' }).click();
  await expect(page.locator('.canvas [data-part]')).toHaveCount(6);
  await expect(page.locator('.canvas [data-wire]')).toHaveCount(6);
});

test('a touch-only device starts in Pan mode', async ({ page }) => {
  await page.addInitScript(() => {
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pan tool' })).toBeVisible();
});
