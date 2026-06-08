/**
 * E2E: Reactive Star Button in Reader Mode
 *
 * Feature: UnifiedBar star button reads `isStarred` from store proxy,
 * updating icon and title text reactively without page reload.
 *
 * Verifies:
 * 1. Star button shows correct initial state (unstarred thread)
 * 2. Clicking star updates button title to "Unstar"
 * 3. Star button shows filled icon for already-starred threads
 * 4. Toggling star back to unstarred updates title to "Star"
 * 5. Star state persists in Starred view after toggle
 * 6. Keyboard shortcut 's' in reader triggers reactive star update
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
});

test.describe('Star button reactivity in reader mode', () => {
  test('star button shows "Star" title for unstarred thread', async ({ page }) => {
    // David Park (t06) is unstarred and rendered as individual row
    const unstarredRow = page.locator('.thread-row:not(.category-row)').filter({ hasText: 'David Park' });
    await unstarredRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toBeVisible();
    await expect(starBtn).toHaveAttribute('title', 'Star');
  });

  test('star button shows "Unstar" title for already-starred thread', async ({ page }) => {
    // Tom Wright (t19) is starred in seed data and rendered as individual row
    const starredRow = page.locator('.thread-row:not(.category-row)').filter({ hasText: 'Tom Wright' });
    await starredRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toBeVisible();
    await expect(starBtn).toHaveAttribute('title', 'Unstar');
  });

  test('clicking star toggles title from "Star" to "Unstar"', async ({ page }) => {
    // Open an unstarred thread (Mike Torres - t11)
    const unstarredRow = page.locator('.thread-row:not(.category-row)').filter({ hasText: 'Mike Torres' });
    await unstarredRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toHaveAttribute('title', 'Star');

    // Click to star
    await starBtn.click();
    await expect(starBtn).toHaveAttribute('title', 'Unstar', { timeout: 3000 });
  });

  test('clicking star on starred thread toggles title to "Star"', async ({ page }) => {
    // Open starred thread (Tom Wright - t19)
    const starredRow = page.locator('.thread-row:not(.category-row)').filter({ hasText: 'Tom Wright' });
    await starredRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toHaveAttribute('title', 'Unstar');

    // Click to unstar
    await starBtn.click();
    await expect(starBtn).toHaveAttribute('title', 'Star', { timeout: 3000 });
  });

  test('star icon uses filled variant for starred state', async ({ page }) => {
    // Open starred thread (Tom Wright)
    await page.locator('.thread-row:not(.category-row)').filter({ hasText: 'Tom Wright' }).click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // The filled star SVG has fill="currentColor" attribute
    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn.locator('svg[fill="currentColor"]')).toBeVisible();
  });

  test('starring a thread makes it appear in Starred view', async ({ page }) => {
    // Open unstarred thread (David Park) and star it
    await page.locator('.thread-row:not(.category-row)').filter({ hasText: 'David Park' }).click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.locator('[data-action="star"]').click();
    await page.waitForTimeout(500);

    // Go back to inbox then switch to Starred view
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);

    // David Park thread should now appear in Starred view
    await expect(page.locator('.thread-row').filter({ hasText: 'David Park' })).toBeVisible({ timeout: 3000 });
  });

  test('keyboard "s" in reader toggles star reactively', async ({ page }) => {
    // Open unstarred thread (David Park)
    await page.locator('.thread-row:not(.category-row)').filter({ hasText: 'David Park' }).click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toHaveAttribute('title', 'Star');

    // Press 's' to star
    await page.keyboard.press('s');
    await expect(starBtn).toHaveAttribute('title', 'Unstar', { timeout: 3000 });

    // Press 's' again to unstar
    await page.keyboard.press('s');
    await expect(starBtn).toHaveAttribute('title', 'Star', { timeout: 3000 });
  });
});
