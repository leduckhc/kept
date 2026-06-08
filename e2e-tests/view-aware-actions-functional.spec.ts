/**
 * E2E: View-Aware Actions — Functional & Usability Tests
 *
 * Tests that actions actually WORK (thread moves between views),
 * not just that buttons are visible. Also covers accessibility,
 * focus management, and tooltip correctness.
 *
 * NOTE: Cross-view navigation tests reload the page after performing
 * an action to re-read from DB, because the app uses optimistic
 * removal (thread leaves the in-memory array). A production sync
 * or page refresh achieves the same re-read. This tests the DB
 * persistence layer is correct.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
});

// ═══════════════════════════════════════════════════════════════
// FUNCTIONAL: actions persist to DB and threads appear in
// destination view after reload
// ═══════════════════════════════════════════════════════════════

test.describe('Functional: Archive persistence', () => {
  test('archive persists to DB — after reload, thread is in Archive view', async ({ page }) => {
    // Count inbox threads
    const inboxCount = await page.locator('.thread-row:not(.category-row)').count();

    // Archive first thread
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(300);

    // Inbox count decreased immediately (optimistic)
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(inboxCount - 1);

    // Reload to re-read from DB
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Navigate to Archive — thread should be there
    await page.locator('.sidebar-btn[data-view="Archive"]').click();
    await page.waitForTimeout(500);
    const archiveRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(archiveRow).toBeVisible({ timeout: 3000 });
  });

  test('move-to-inbox from Archive restores thread (after reload)', async ({ page }) => {
    // Archive a thread first
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(300);

    // Reload to get fresh state with all threads
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Go to Archive
    await page.locator('.sidebar-btn[data-view="Archive"]').click();
    await page.waitForTimeout(500);

    // Open the archived thread and use move-to-inbox
    const archiveRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(archiveRow).toBeVisible({ timeout: 3000 });
    await archiveRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="move-to-inbox"]').click();
    await page.waitForTimeout(300);

    // Should exit reader (exitsReader: true)
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);

    // Reload and go to Inbox — thread should be back
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    const restored = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(restored).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Functional: Trash persistence', () => {
  test('trash persists to DB — after reload, thread is in Trash view', async ({ page }) => {
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);

    // Reload
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    // Go to Trash — thread should be there
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);
    const trashRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(trashRow).toBeVisible({ timeout: 3000 });
  });

  test('restore from Trash returns thread to Inbox (after reload)', async ({ page }) => {
    // Trash first
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);

    // Reload and navigate to Trash
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);

    // Restore it
    const trashRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(trashRow).toBeVisible({ timeout: 3000 });
    await trashRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="restore"]').click();
    await page.waitForTimeout(300);

    // Exits reader
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);

    // Reload and check Inbox
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    const restored = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(restored).toBeVisible({ timeout: 3000 });
  });

  test('delete permanently removes thread from DB', async ({ page }) => {
    // Trash first
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);

    // Reload and go to Trash
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);

    // Delete permanently
    const trashRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await trashRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="delete-permanently"]').click();
    await page.waitForTimeout(300);

    // Reload — thread should be nowhere
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    // Not in Inbox
    await expect(page.locator(`.thread-row[data-id="${threadId}"]`)).not.toBeVisible();
    // Not in Trash
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator(`.thread-row[data-id="${threadId}"]`)).not.toBeVisible();
  });
});

test.describe('Functional: Set Aside persistence', () => {
  test('set-aside persists — after reload, thread is in SetAside view', async ({ page }) => {
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="set-aside"]').click();
    await page.waitForTimeout(300);

    // Exits reader
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);

    // Reload and navigate to SetAside
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="SetAside"]').click();
    await page.waitForTimeout(500);
    const row = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(row).toBeVisible({ timeout: 3000 });
  });

  test('unset-aside returns thread to inbox (after reload)', async ({ page }) => {
    // Set aside first
    const firstRow = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await firstRow.getAttribute('data-id');
    await firstRow.click();
    await page.locator('[data-action="set-aside"]').click();
    await page.waitForTimeout(300);

    // Reload, go to SetAside
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="SetAside"]').click();
    await page.waitForTimeout(500);

    // Unset aside
    const row = page.locator(`.thread-row[data-id="${threadId}"]`);
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="unset-aside"]').click();
    await page.waitForTimeout(300);

    // Reload — thread should be back in Inbox
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    const restored = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(restored).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Functional: Star/Unstar persistence', () => {
  test('starring persists — after reload, thread is in Starred view', async ({ page }) => {
    const row = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await row.getAttribute('data-id');
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.locator('[data-action="star"]').click();
    await page.waitForTimeout(200);

    // Reload and check Starred
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);

    const starredRow = page.locator(`.thread-row[data-id="${threadId}"]`);
    await expect(starredRow).toBeVisible({ timeout: 3000 });
  });

  test('unstarring removes from Starred view (after reload)', async ({ page }) => {
    // Go to Starred (seed has t05, t07, t19 starred)
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);

    const starredCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(starredCount).toBeGreaterThanOrEqual(1);

    // Get first starred thread's id
    const row = page.locator('.thread-row:not(.category-row)').first();
    const threadId = await row.getAttribute('data-id');
    await row.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="unstar"]').click();
    await page.waitForTimeout(300);

    // Reload and check Starred count decreased
    await page.goto('/');
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(starredCount - 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// USABILITY: focus, exits, tooltips, accessibility
// ═══════════════════════════════════════════════════════════════

test.describe('Usability: Reader exit behavior', () => {
  test('archive exits reader (goes back to list)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
  });

  test('trash exits reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="trash"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
  });

  test('star does NOT exit reader (stays open)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="star"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  });

  test('mark-read-unread does NOT exit reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="mark-read-unread"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  });
});

test.describe('Usability: Tooltips & accessibility', () => {
  test('all action buttons have title attributes', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const buttons = page.locator('.unified-bar-actions button[data-action]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const title = await buttons.nth(i).getAttribute('title');
      expect(title, `Button at index ${i} should have a title`).toBeTruthy();
      expect(title!.length).toBeGreaterThan(0);
    }
  });

  test('action buttons have distinct data-action values (no duplicates)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const buttons = page.locator('.unified-bar-actions button[data-action]');
    const count = await buttons.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(await buttons.nth(i).getAttribute('data-action') as string);
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('action buttons contain SVG icons (not empty)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const buttons = page.locator('.unified-bar-actions button[data-action]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const html = await buttons.nth(i).innerHTML();
      expect(html, `Button ${i} should have SVG content`).toContain('<svg');
    }
  });
});

test.describe('Usability: Keyboard shortcuts match view', () => {
  test('pressing "s" in Inbox stars the thread (stays in reader)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.keyboard.press('s');
    await page.waitForTimeout(200);

    // Still in reader
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    // Star button should now show "Unstar" title
    const starBtn = page.locator('[data-action="star"]');
    await expect(starBtn).toHaveAttribute('title', 'Unstar');
  });

  test('pressing "v" in Inbox sets aside the thread (exits reader)', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.keyboard.press('v');
    await page.waitForTimeout(300);

    // Should exit reader
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
  });

  test('pressing "u" toggles read/unread state without exiting reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.keyboard.press('u');
    await page.waitForTimeout(200);

    // Still in reader
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  });
});

// ═══════════════════════════════════════════════════════════════
// VIEW-SPECIFIC: Sent view actions
// ═══════════════════════════════════════════════════════════════

test.describe('Sent view actions', () => {
  test('Sent view shows archive, trash, star (no set-aside, no mark-read)', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Sent"]').click();
    await page.waitForTimeout(500);

    const sentRow = page.locator('.thread-row:not(.category-row)').first();
    await expect(sentRow).toBeVisible({ timeout: 3000 });
    await sentRow.click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    const actionsBar = page.locator('.unified-bar-actions');
    await expect(actionsBar.locator('[data-action="archive"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="trash"]')).toBeVisible();
    await expect(actionsBar.locator('[data-action="star"]')).toBeVisible();

    // Should NOT have set-aside or mark-read
    await expect(actionsBar.locator('[data-action="set-aside"]')).not.toBeVisible();
    await expect(actionsBar.locator('[data-action="mark-read-unread"]')).not.toBeVisible();
  });
});
