import { test, expect, type Page } from '@playwright/test';

// Reset DB to seed state before each test
test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

/** Click a sidebar view button */
async function clickView(page: Page, viewName: string) {
  await page.locator(`.sidebar-btn[data-view="${viewName}"]`).click();
}

test.describe('View switching — sidebar navigation', () => {
  test('clicking a view button switches the active view', async ({ page }) => {
    // Default is Inbox
    await expect(page.locator('.sidebar-btn[data-view="Inbox"]')).toHaveClass(/active/);

    await clickView(page, 'Starred');
    await expect(page.locator('.sidebar-btn[data-view="Starred"]')).toHaveClass(/active/);
    await expect(page.locator('.sidebar-btn[data-view="Inbox"]')).not.toHaveClass(/active/);
  });

  test('all sidebar views are clickable and mark active', async ({ page }) => {
    const views = ['Starred', 'Sent', 'Drafts', 'Trash', 'Archive', 'Scheduled', 'Reminders'];
    for (const view of views) {
      await clickView(page, view);
      await expect(page.locator(`.sidebar-btn[data-view="${view}"]`)).toHaveClass(/active/);
    }
    // Return to inbox
    await clickView(page, 'Inbox');
    await expect(page.locator('.sidebar-btn[data-view="Inbox"]')).toHaveClass(/active/);
  });
});

test.describe('View switching — state cleanup', () => {
  test('switching view clears search query', async ({ page }) => {
    const searchInput = page.locator('#search');
    await searchInput.fill('important query');
    await expect(searchInput).toHaveValue('important query');

    await clickView(page, 'Trash');
    // Search is hidden in non-inbox views; switch back to verify it's cleared
    await clickView(page, 'Inbox');
    await expect(searchInput).toHaveValue('');
  });

  test('switching view deselects thread and closes reader', async ({ page }) => {
    // Open a thread
    await page.locator('.thread-row:not(.category-row)').first().click();

    // On 2-pane layouts, reader should open
    const appShell = page.locator('#app-shell');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1400) {
      await expect(appShell).toHaveClass(/reader-open/);
    }

    // Switch view — reader should close
    await clickView(page, 'Archive');

    // No thread should be selected (no reader-open)
    await expect(appShell).not.toHaveClass(/reader-open/);
  });

  test('switching view clears bulk selection', async ({ page }) => {
    // Click avatar to start bulk selection
    const firstAvatar = page.locator('.thread-row:not(.category-row) .avatar-wrap').first();
    await firstAvatar.click();

    // Unified bar should enter bulk mode
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible();

    // Switch view
    await clickView(page, 'Sent');

    // Bulk mode should be gone
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).not.toBeVisible();
  });

  test('switching view clears category filter', async ({ page }) => {
    // Click a category row to enter folder mode (if one exists)
    const categoryRow = page.locator('.thread-row.category-row').first();
    if (await categoryRow.count() === 0) {
      test.skip();
      return;
    }
    await categoryRow.click();
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible();

    // Switch view — should reset to inbox mode
    await clickView(page, 'Starred');
    await expect(page.locator('.unified-bar[data-mode="folder"]')).not.toBeVisible();
  });
});

test.describe('View switching — unified bar mode', () => {
  test('inbox view shows search and compose in unified bar', async ({ page }) => {
    await expect(page.locator('#search')).toBeVisible();
    await expect(page.locator('.btn-compose')).toBeVisible();
  });

  test('non-inbox views do NOT show search pill', async ({ page }) => {
    await clickView(page, 'Trash');
    // Search should not be visible in non-inbox views
    // (absence signals context change per user requirement)
    const searchWrap = page.locator('.search-pill-wrap');
    await expect(searchWrap).not.toBeVisible();
  });

  test('returning to inbox restores search and compose', async ({ page }) => {
    await clickView(page, 'Archive');
    await expect(page.locator('.search-pill-wrap')).not.toBeVisible();

    await clickView(page, 'Inbox');
    await expect(page.locator('#search')).toBeVisible();
    await expect(page.locator('.btn-compose')).toBeVisible();
  });
});

test.describe('View switching — keyboard', () => {
  test('g then i navigates to Inbox', async ({ page }) => {
    await clickView(page, 'Trash');
    await expect(page.locator('.sidebar-btn[data-view="Trash"]')).toHaveClass(/active/);

    await page.keyboard.press('g');
    await page.keyboard.press('i');
    await expect(page.locator('.sidebar-btn[data-view="Inbox"]')).toHaveClass(/active/);
  });

  test('g then s navigates to Starred', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect(page.locator('.sidebar-btn[data-view="Starred"]')).toHaveClass(/active/);
  });

  test('g then t navigates to Trash', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('t');
    await expect(page.locator('.sidebar-btn[data-view="Trash"]')).toHaveClass(/active/);
  });
});
