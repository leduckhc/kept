import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

test.describe('Grouped thread rows: count bubble', () => {
  test('sender group row shows count bubble with correct count', async ({ page }) => {
    const senderGroupRows = page.locator('.sender-group-row');
    await expect(senderGroupRows).toHaveCount(1);

    const firstGroup = senderGroupRows.first();
    // Should have a count bubble
    const bubble = firstGroup.locator('.count-bubble');
    await expect(bubble).toBeVisible();

    // Sarah Chen has 4 threads in seed (t02, t30, t31, t32)
    await expect(bubble).toHaveText('4');

    // Should NOT have stacked-behind avatar (old design removed)
    await expect(firstGroup.locator('.stacked-behind')).toHaveCount(0);
  });

  test('sender group row has favicon avatar instead of plain initial', async ({ page }) => {
    const firstGroup = page.locator('.sender-group-row').first();
    const avatar = firstGroup.locator('.avatar');
    await expect(avatar).toBeVisible();
    const favicon = firstGroup.locator('.avatar-favicon');
    await expect(favicon).toHaveCount(1);
  });

  test('clicking sender group row filters to that sender', async ({ page }) => {
    const firstGroup = page.locator('.sender-group-row').first();
    // Click the subject line area (not avatar)
    await firstGroup.locator('.thread-subject-line').click();

    // Should now show individual threads from Sarah Chen
    const rows = page.locator('.thread-row');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
