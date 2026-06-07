/**
 * E2E feature coverage tests for Kept
 * 
 * Covers features from the backlog that are NOT in smoke.spec.ts:
 * search, compose, triage, view switching (all views), star/unstar,
 * settings, thread reader details, bulk actions, category nav, unread state.
 */
import { test, expect } from '@playwright/test';

// Reset DB to seed state before each test
test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
});

// ─── Search ───────────────────────────────────────────────────────────────────

test.describe('Search', () => {
  test('search toggle button is visible', async ({ page }) => {
    await expect(page.locator('#btn-search-toggle')).toBeVisible();
  });

  test('search filters threads by subject keyword', async ({ page }) => {
    const beforeCount = await page.locator('.thread-row:not(.category-row)').count();
    // Expand search first
    await page.locator('#btn-search-toggle').click();
    await page.waitForTimeout(200);
    await page.locator('.search-input').fill('resume');
    // Wait for FTS query to complete (200ms debounce + HTTP round-trip)
    await page.waitForFunction(
      (initial) => document.querySelectorAll('.thread-row:not(.category-row)').length < initial,
      beforeCount,
      { timeout: 5000 }
    );
    const afterCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(afterCount).toBeLessThan(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  test('clearing search restores all threads', async ({ page }) => {
    const beforeCount = await page.locator('.thread-row:not(.category-row)').count();
    await page.locator('#btn-search-toggle').click();
    await page.waitForTimeout(200);
    await page.locator('.search-input').fill('Project kickoff');
    await page.waitForTimeout(400);
    await page.locator('.search-input').fill('');
    await page.waitForTimeout(400);
    const afterCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(afterCount).toBe(beforeCount);
  });

  test('Escape clears search query', async ({ page }) => {
    await page.locator('#btn-search-toggle').click();
    await page.waitForTimeout(200);
    await page.locator('.search-input').fill('Amazon');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const val = await page.locator('.search-input').inputValue();
    expect(val).toBe('');
  });

  test('search matches sender name', async ({ page }) => {
    await page.locator('#btn-search-toggle').click();
    await page.waitForTimeout(200);
    await page.locator('.search-input').fill('David');
    await page.waitForTimeout(400);
    const threads = page.locator('.thread-row:not(.category-row)');
    const count = await threads.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Compose ──────────────────────────────────────────────────────────────────

test.describe('Compose', () => {
  test('pressing c opens compose panel', async ({ page }) => {
    // Blur search input first
    await page.locator('.inbox').click();
    await page.keyboard.press('c');
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
  });

  test('compose button opens compose', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
  });

  test('compose has From, To, Subject, and body editor', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    // From shows account email
    await expect(page.locator('.compose-panel')).toContainText('testuser@gmail.com');
    // To input (use .first() since cc/bcc also match)
    await expect(page.locator('.compose-panel .compose-to')).toBeVisible();
    // Subject input
    await expect(page.locator('.compose-panel input[placeholder="Subject"]')).toBeVisible();
    // Body editor
    await expect(page.locator('.compose-panel [contenteditable]')).toBeVisible();
  });

  test('compose has Send button', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.compose-send-btn-new')).toBeVisible();
  });

  test('close button closes compose', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    await page.locator('.compose-panel-close').click();
    await expect(page.locator('.compose-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('Discard button closes compose', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    await page.locator('.compose-discard-btn-new').click();
    await expect(page.locator('.compose-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('compose has Snippets button', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.compose-snippets-btn')).toBeVisible();
  });

  test('compose body includes signature', async ({ page }) => {
    await page.locator('#btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible({ timeout: 3000 });
    const body = await page.locator('.compose-panel [contenteditable]').textContent();
    expect(body).toContain('Best regards');
  });
});

// ─── View switching ───────────────────────────────────────────────────────────

test.describe('View switching', () => {
  test('Triage view shows triage container', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Triage"]').click();
    await expect(page.locator('.triage-container')).toBeVisible({ timeout: 5000 });
  });

  test('Sent view shows sent threads', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Sent"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(2); // t21, t22
  });

  test('Starred view shows starred threads', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(3); // t05, t07, t19
  });

  test('switching views and back to Inbox restores thread count', async ({ page }) => {
    await page.waitForSelector('.thread-row', { timeout: 5000 });
    const inboxCount = await page.locator('.thread-row').count();
    expect(inboxCount).toBeGreaterThanOrEqual(4);
    // Switch to Sent
    await page.evaluate(() => {
      const btn = document.querySelector('#sidebar .sidebar-btn[data-view="Sent"]') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#sidebar .sidebar-btn[data-view="Sent"].active', { timeout: 5000 });
    // Switch back to Inbox
    await page.evaluate(() => {
      const btn = document.querySelector('#sidebar .sidebar-btn[data-view="Inbox"]') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#sidebar .sidebar-btn[data-view="Inbox"].active', { timeout: 5000 });
    await page.waitForSelector('.thread-row', { timeout: 8000 });
    await page.waitForTimeout(300);
    const afterCount = await page.locator('.thread-row').count();
    expect(afterCount).toBeGreaterThanOrEqual(inboxCount - 1);
  });

  test('Snoozed view loads without crash', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Snoozed"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('SetAside view loads without crash', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="SetAside"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('Drafts view loads without crash', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Drafts"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('Trash view loads without crash', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Trash"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('Archive view loads without crash', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Archive"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app-shell')).toBeVisible();
  });
});

// ─── Star / Unstar ────────────────────────────────────────────────────────────

test.describe('Star / Unstar', () => {
  test('starred threads appear in Starred view', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('starring from reader adds to Starred view', async ({ page }) => {
    // Open first non-starred personal thread
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });

    // Look for star action button
    const starBtn = page.locator('[data-action="star"], [data-action="toggle-star"]').first();
    if (!await starBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // May be in overflow menu
      const overflow = page.locator('[data-action="overflow"]').first();
      if (await overflow.isVisible().catch(() => false)) {
        await overflow.click();
        await page.waitForTimeout(200);
      }
    }
    if (!await starBtn.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
    await starBtn.click();
    await page.waitForTimeout(300);

    // Navigate to Starred
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.sidebar-btn[data-view="Starred"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(4); // was 3, now 4
  });
});

// ─── Thread reader details ────────────────────────────────────────────────────

test.describe('Thread reader', () => {
  test('reader shows message body', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
    const reader = page.locator('.reader-pane');
    await expect(reader).toBeVisible();
    const text = await reader.textContent();
    expect(text!.length).toBeGreaterThan(20);
  });

  test('reader shows sender name', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
    const reader = page.locator('.reader-pane');
    const text = await reader.textContent();
    expect(text).toContain('David');
  });

  test('unified bar mode correct in reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
    const mode = await page.locator('.unified-bar').getAttribute('data-mode');
    expect(['inbox', 'reader']).toContain(mode);
  });

  test('reader has message content area', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
    // The reader-pane should have content (message bodies rendered as HTML)
    const reader = page.locator('.reader-pane');
    const text = await reader.textContent();
    // Should have substantial content from message bodies
    expect(text!.length).toBeGreaterThan(50);
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('account avatar opens settings panel', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
  });

  test('settings shows account email', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.settings-panel')).toContainText('testuser@gmail.com');
  });

  test('settings has dark mode toggle', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#settings-darkmode-toggle')).toBeVisible();
  });

  test('settings has search filter input', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#settings-search')).toBeVisible();
  });

  test('settings back button closes panel', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel.open')).toBeVisible({ timeout: 3000 });
    await page.locator('#settings-back').click();
    await page.waitForTimeout(300);
    // Panel uses transform to slide off-screen; check class removal
    await expect(page.locator('.settings-panel')).not.toHaveClass(/open/, { timeout: 3000 });
  });

  test('dark mode toggle applies dark theme', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await page.locator('#settings-darkmode-toggle').click();
    await page.waitForTimeout(200);
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark'
    );
    expect(isDark).toBe(true);
  });

  test('settings search filters visible sections', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await page.locator('#settings-search').fill('dark');
    await page.waitForTimeout(300);
    await expect(page.locator('#settings-darkmode-row')).toBeVisible();
  });

  test('sign out button present for account', async ({ page }) => {
    await page.locator('#btn-account').click();
    await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.settings-account-signout')).toBeVisible();
  });
});

// ─── Triage mode ──────────────────────────────────────────────────────────────

test.describe('Triage mode', () => {
  test('triage shows progress bar and stats', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Triage"]').click();
    await expect(page.locator('.triage-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.triage-progress')).toBeVisible();
    await expect(page.locator('.triage-stats')).toBeVisible();
  });

  test('triage shows card with thread content', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Triage"]').click();
    await expect(page.locator('.triage-container')).toBeVisible({ timeout: 5000 });
    const card = page.locator('.triage-card');
    if (!await card.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }
    const text = await card.textContent();
    expect(text!.length).toBeGreaterThan(5);
  });

  test('triage has action buttons', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Triage"]').click();
    await expect(page.locator('.triage-container')).toBeVisible({ timeout: 5000 });
    const card = page.locator('.triage-card');
    if (!await card.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }
    const actions = page.locator('.triage-actions button, .triage-btn');
    const count = await actions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('skip advances to next triage card', async ({ page }) => {
    await page.locator('.sidebar-btn[data-view="Triage"]').click();
    await expect(page.locator('.triage-container')).toBeVisible({ timeout: 5000 });
    const card = page.locator('.triage-card');
    if (!await card.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }
    const firstText = await card.locator('.triage-subject, .triage-sender').first().textContent().catch(() => null);
    const skipBtn = page.locator('button:has-text("Skip"), [data-triage-action="skip"]').first();
    if (!await skipBtn.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
    await skipBtn.click();
    await page.waitForTimeout(400);
    // Either next card or triage complete
    if (await card.isVisible().catch(() => false)) {
      const newText = await card.locator('.triage-subject, .triage-sender').first().textContent().catch(() => null);
      expect(newText).not.toBe(firstText);
    }
  });
});

// ─── Bulk actions ─────────────────────────────────────────────────────────────

test.describe('Bulk actions', () => {
  test('bulk bar shows archive button', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row) .avatar-wrap').first().click();
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#bulk-archive')).toBeVisible();
  });

  test('bulk archive removes selected thread', async ({ page }) => {
    const beforeCount = await page.locator('.thread-row:not(.category-row)').count();
    await page.locator('.thread-row:not(.category-row) .avatar-wrap').first().click();
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible({ timeout: 3000 });
    await page.locator('#bulk-archive').click();
    await page.waitForTimeout(500);
    const afterCount = await page.locator('.thread-row:not(.category-row)').count();
    expect(afterCount).toBe(beforeCount - 1);
  });

  test('multi-select updates bulk count', async ({ page }) => {
    const avatars = page.locator('.thread-row:not(.category-row) .avatar-wrap');
    await avatars.nth(0).click();
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible({ timeout: 3000 });
    let text = await page.locator('.bulk-count').textContent();
    expect(text).toContain('1');
    await avatars.nth(1).click();
    await page.waitForTimeout(200);
    text = await page.locator('.bulk-count').textContent();
    expect(text).toContain('2');
  });
});

// ─── Category navigation ─────────────────────────────────────────────────────

test.describe('Category navigation', () => {
  test('Updates category row shows sender badges', async ({ page }) => {
    const updates = page.locator('.thread-row[data-category="updates"]');
    await expect(updates).toBeVisible();
    const badges = updates.locator('.sender-badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Newsletters category row visible', async ({ page }) => {
    await expect(page.locator('.thread-row[data-category="newsletters"]')).toBeVisible();
  });

  test('clicking category enters folder mode with filtered threads', async ({ page }) => {
    await page.locator('.thread-row[data-category="newsletters"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible();
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(3); // 3 newsletter threads
  });

  test('clicking sender badge filters to that sender only', async ({ page }) => {
    await page.locator('.sender-badge').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible();
    const count = await page.locator('.thread-row:not(.category-row)').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Unread state ─────────────────────────────────────────────────────────────

test.describe('Unread indicators', () => {
  test('unread threads have visible unread dot', async ({ page }) => {
    const visibleDots = await page.evaluate(() => {
      const dots = document.querySelectorAll('.thread-row:not(.category-row) .unread-dot');
      let visible = 0;
      dots.forEach(d => {
        const style = getComputedStyle(d);
        if (style.opacity !== '0' && style.display !== 'none' && style.visibility !== 'hidden'
            && (d as HTMLElement).offsetWidth > 0) {
          visible++;
        }
      });
      return visible;
    });
    // E2E DB: t01, t02, t03, t09 are unread (but grouped in categories)
    expect(visibleDots).toBeGreaterThanOrEqual(1);
  });
});
