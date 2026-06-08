/**
 * E2E: View-Aware Thread Actions
 *
 * Verifies that the reader bar shows the correct set of action buttons
 * depending on which view the user is in.
 *
 * Key behavior:
 * - Inbox shows: archive, trash, star, snooze, set-aside, mark-read-unread
 * - Trash shows: restore, delete-permanently (no archive)
 * - Archive shows: move-to-inbox, trash, star, snooze (no archive)
 * - Starred shows: unstar, archive, trash, snooze, set-aside, mark-read-unread
 * - Drafts shows: trash only
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
});

test.describe('View-aware reader actions', () => {
  test('Inbox reader shows archive, trash, star, snooze, set-aside, mark-read-unread', async ({ page }) => {
    // Click any thread in Inbox
    const row = page.locator('.thread-row:not(.category-row)').first();
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const actionsBar = page.locator('.unified-bar-actions');
    await expect(actionsBar.locator('[data-action="archive"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="trash"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="star"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="snooze"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="set-aside"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="mark-read-unread"]')).toBeVisible();

    // Should NOT have restore or delete-permanently
    await expect(actionsBar.locator('[data-action="restore"]')).not.toBeVisible();
    await expect(actionsBar.locator('[data-action="delete-permanently"]')).not.toBeVisible();
  });

  test('Trash reader shows only restore and delete-permanently', async ({ page }) => {
    // Trash a thread via the reader bar
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    await firstRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);

    // Reload to re-read from DB (optimistic removal drops thread from memory)
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Navigate to Trash view
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);

    // Open a thread in Trash
    const trashRow = page.locator('.thread-row:not(.category-row)').first();
    await expect(trashRow).toBeVisible({ timeout: 3000 });
    await trashRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const actionsBar = page.locator('.unified-bar-actions');
    await expect(actionsBar.locator('[data-action="restore"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="delete-permanently"]')).toBeVisible();

    // Should NOT have archive, star, snooze
    await expect(actionsBar.locator('[data-action="archive"]')).not.toBeVisible();
    await expect(actionsBar.locator('[data-action="star"]')).not.toBeVisible();
    await expect(actionsBar.locator('[data-action="snooze"]')).not.toBeVisible();
  });

  test('Starred view reader shows unstar (not star) + archive, trash, snooze, set-aside', async ({ page }) => {
    // Switch to Starred view (seed has starred threads)
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);

    const starredRow = page.locator('.thread-row:not(.category-row)').first();
    await expect(starredRow).toBeVisible({ timeout: 3000 });
    await starredRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const actionsBar = page.locator('.unified-bar-actions');
    await expect(actionsBar.locator('[data-action="unstar"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="archive"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="trash"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="snooze"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="set-aside"]')).toBeVisible();

    // Should NOT have regular star button
    await expect(actionsBar.locator('[data-action="star"]')).not.toBeVisible();
  });

  test('Archive view reader shows move-to-inbox, trash, star, snooze (no archive)', async ({ page }) => {
    // First archive a thread
    const row = page.locator('.thread-row:not(.category-row)').first();
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(300);

    // Reload to re-read from DB (optimistic removal drops thread from memory)
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Navigate to Archive view
    await page.locator('.sidebar-btn[data-view="Archive"]').click();
    await page.waitForTimeout(500);

    const archiveRow = page.locator('.thread-row:not(.category-row)').first();
    await expect(archiveRow).toBeVisible({ timeout: 3000 });
    await archiveRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const actionsBar = page.locator('.unified-bar-actions');
    await expect(actionsBar.locator('[data-action="move-to-inbox"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="trash"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="star"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="snooze"]')).toBeVisible();

    // Should NOT have archive button (thread is already archived)
    await expect(actionsBar.locator('[data-action="archive"]')).not.toBeVisible();
  });

  test('keyboard "e" does nothing in Trash view (no archive action)', async ({ page }) => {
    // Trash a thread first
    const row = page.locator('.thread-row:not(.category-row)').first();
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);

    // Reload to re-read from DB
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Go to Trash
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);

    const trashRow = page.locator('.thread-row:not(.category-row)').first();
    await expect(trashRow).toBeVisible({ timeout: 3000 });
    await trashRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Press 'e' — should NOT archive (stay in reader)
    await page.keyboard.press('e');
    await page.waitForTimeout(300);

    // Still in reader mode (didn't exit)
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  });
});
