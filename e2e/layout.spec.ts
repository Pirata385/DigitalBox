import { expect, test } from '@playwright/test';

/** Three viewports from the spec: desktop, phone portrait and phone landscape. */
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

for (const vp of viewports) {
  test(`${vp.name}: no horizontal page scroll and a usable canvas`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByRole('application', { name: /circuit canvas/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const canvas = await page.locator('.canvas').boundingBox();
    expect(canvas?.width ?? 0).toBeGreaterThan(200);
    expect(canvas?.height ?? 0).toBeGreaterThan(150);
  });

  test(`${vp.name}: screenshot`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.locator('summary', { hasText: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Half adder' }).click();
    const dir = process.env.SCREENSHOT_DIR ?? 'test-results/screens';
    await page.screenshot({ path: `${dir}/${vp.name}.png` });
  });
}
