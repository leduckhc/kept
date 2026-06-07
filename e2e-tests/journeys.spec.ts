/**
 * E2E User Journey Tests for Kept (Solid)
 *
 * Multi-step flows simulating real user behavior across features.
 * Each test covers a complete workflow from start to finish.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
});

// ─── Journey 1: Triage Workflow ───────────────────────────────────────────────
// User opens app → reads email → archives → moves to next

test.describe('Journey: Triage workflow', () => {
  test('open thread → archive → auto-advance to inbox', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();

    // Open first thread
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Archive it
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(500);

    // Should close reader and reduce thread count
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 1, { timeout: 3000 });
  });

  test('keyboard triage: j → Enter → e → repeat', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();

    // Select first with j
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await expect(page.locator('.thread-row.is-selected')).toHaveCount(1);

    // Open with Enter
    await page.keyboard.press('Enter');
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Archive with e
    await page.keyboard.press('e');
    await page.waitForTimeout(500);

    // Back in inbox with one less thread
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 1, { timeout: 3000 });
  });

  test('bulk triage: select multiple → archive all', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();
    if (initialCount < 2) {
      test.skip(true, 'Need at least 2 threads');
      return;
    }

    // Select first via avatar
    await page.locator('.thread-row:not(.category-row) .avatar-wrap').first().click();
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible({ timeout: 3000 });

    // Select second via avatar
    await page.locator('.thread-row:not(.category-row) .avatar-wrap').nth(1).click();
    await expect(page.locator('.bulk-count')).toContainText('2');

    // Bulk archive
    await page.locator('#bulk-archive').click();
    await page.waitForTimeout(500);

    // Should exit bulk mode and reduce count by 2
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).not.toBeVisible();
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 2, { timeout: 3000 });
  });
});

// ─── Journey 2: Search & Act ──────────────────────────────────────────────────
// User searches → finds thread → opens → stars → goes back

test.describe('Journey: Search and act', () => {
  test('search → open result → star → return to inbox', async ({ page }) => {
    // Search for a specific thread
    await page.locator('#search').click();
    await page.locator('#search').fill('resume');
    await page.waitForTimeout(500);

    const searchCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(searchCount).toBeGreaterThan(0);

    // Open the first result
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Star it
    await page.locator('[data-action="prioritize"]').click();
    await page.waitForTimeout(300);

    // Close reader
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);

    // Clear search to return to full inbox
    await page.locator('#search').fill('');
    await page.waitForTimeout(400);

    const finalCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(finalCount).toBeGreaterThan(searchCount);
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.locator('#search').click();
    await page.locator('#search').fill('xyznonexistent99999');
    await page.waitForTimeout(500);

    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBe(0);
  });
});

// ─── Journey 3: Category Exploration ──────────────────────────────────────────
// User clicks category → browses threads → opens one → goes back to inbox

test.describe('Journey: Category exploration', () => {
  test('open category → browse → open thread → back to category → back to inbox', async ({ page }) => {
    const categoryRow = page.locator('.category-row').first();
    if (await categoryRow.count() === 0) {
      test.skip(true, 'No categories in seed data');
      return;
    }

    // Click category
    await categoryRow.click();
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible({ timeout: 3000 });

    // Should show threads from category
    const catThreads = await page.locator('.thread-row:not(.category-row)').count();
    expect(catThreads).toBeGreaterThan(0);

    // Open a thread from the category
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Close reader
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);

    // Back to inbox via breadcrumb
    await page.locator('.breadcrumb-link').click();
    await expect(page.locator('.unified-bar[data-mode="inbox"]')).toBeVisible({ timeout: 3000 });
  });
});

// ─── Journey 4: View Switching ────────────────────────────────────────────────
// User switches views, verifies context changes

test.describe('Journey: View switching', () => {
  test('inbox → starred → set-aside → inbox preserves state', async ({ page }) => {
    const inboxCount = await page.locator('.thread-row').count();

    // Switch to Starred
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.sidebar-btn[data-view="Starred"]')).toHaveClass(/active/);

    // Switch to Set Aside
    await page.locator('.sidebar-btn[data-view="SetAside"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.sidebar-btn[data-view="SetAside"]')).toHaveClass(/active/);

    // Back to Inbox
    await page.locator('.sidebar-btn[data-view="Inbox"]').click();
    await page.waitForTimeout(300);
    const finalCount = await page.locator('.thread-row').count();
    expect(finalCount).toBe(inboxCount);
  });

  test('search is cleared when switching views', async ({ page }) => {
    // Type in search
    await page.locator('#search').click();
    await page.locator('#search').fill('test');
    await page.waitForTimeout(300);

    // Switch to Starred
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(300);

    // Switch back to Inbox
    await page.locator('.sidebar-btn[data-view="Inbox"]').click();
    await page.waitForTimeout(300);

    // Search should be cleared
    await expect(page.locator('#search')).toHaveValue('');
  });
});

// ─── Journey 5: Archive Persists ──────────────────────────────────────────────

test.describe('Journey: Data persistence', () => {
  test('archived thread stays gone after page reload', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();

    // Open and archive
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();
    await page.waitForTimeout(500);

    // Reload
    await page.reload();
    await page.waitForSelector('.thread-row', { timeout: 8000 });

    const afterCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(afterCount).toBe(initialCount - 1);
  });

  test('starred thread shows in starred view', async ({ page }) => {
    // Star a thread
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="prioritize"]').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Switch to Starred view
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);

    // Should have at least 1 thread
    const starredCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(starredCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── Journey 6: Keyboard Power User ──────────────────────────────────────────

test.describe('Journey: Keyboard power user', () => {
  test('full keyboard-only triage session', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();

    // Navigate down twice
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    await page.keyboard.press('j');
    await page.waitForTimeout(150);

    // Star current
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    // Open with Enter
    await page.keyboard.press('Enter');
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    // Archive from reader
    await page.keyboard.press('e');
    await page.waitForTimeout(500);

    // Back in inbox with one less
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 1, { timeout: 3000 });
  });

  test('/ search → Escape → j nav still works', async ({ page }) => {
    // Focus search
    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();

    // Type and escape
    await page.locator('#search').fill('test');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // j should now navigate threads (not be captured by search)
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await expect(page.locator('.thread-row.is-selected')).toHaveCount(1);
  });

  test('x bulk select → Escape cancels', async ({ page }) => {
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    await page.keyboard.press('x');
    await page.waitForTimeout(200);

    // Should be in bulk mode
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible({ timeout: 3000 });

    // Escape should cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).not.toBeVisible();
  });
});

// ─── Journey 7: Mobile-like narrow viewport ───────────────────────────────────

test.describe('Journey: Responsive behavior', () => {
  test('thread reader is full-width on narrow viewport', async ({ page }) => {
    test.skip(true, 'Mobile layout (sidebar toggle) not yet fully implemented in Solid');
  });

  test('sidebar hidden on mobile, toggle via hamburger', async ({ page }) => {
    test.skip(true, 'Mobile sidebar toggle not yet implemented in Solid');
  });
});
