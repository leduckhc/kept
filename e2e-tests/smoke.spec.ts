import { test, expect } from '@playwright/test';

// Reset IndexedDB before each test to start from seed state
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('kept-e2e');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });
  await page.reload();
  await page.waitForSelector('.thread-row');
});

test.describe('Thread click → reader', () => {
  test('clicking a thread row opens the reader pane', async ({ page }) => {
    const firstThread = page.locator('.thread-row:not(.category-row)').first();
    const subject = await firstThread.locator('.thread-subject-line').textContent();
    await firstThread.click();

    // Reader should open — app-shell gets reader-open class
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    // Unified bar should switch to reader mode
    await expect(page.locator('.unified-bar[data-mode="reader"]')).toBeVisible();
  });

  test('clicking back closes the reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.locator('#unified-bar-back').click();
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
  });

  test('Escape closes the reader', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#app-shell')).not.toHaveClass(/reader-open/);
  });
});

test.describe('Avatar click → bulk selection', () => {
  test('clicking avatar selects thread and shows bulk bar', async ({ page }) => {
    const avatar = page.locator('.thread-row:not(.category-row) .avatar-wrap').first();
    await avatar.click();

    // Unified bar should switch to bulk mode
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible();
    await expect(page.locator('.bulk-count')).toContainText('1');
  });

  test('clicking cancel exits bulk mode', async ({ page }) => {
    await page.locator('.thread-row:not(.category-row) .avatar-wrap').first().click();
    await expect(page.locator('.unified-bar[data-mode="bulk"]')).toBeVisible();

    await page.locator('#bulk-cancel').click();
    // Should return to inbox mode
    await expect(page.locator('.unified-bar[data-mode="inbox"]')).toBeVisible();
  });

  test('selecting multiple threads updates count', async ({ page }) => {
    const avatars = page.locator('.thread-row:not(.category-row) .avatar-wrap');
    await avatars.nth(0).click();
    await avatars.nth(1).click();

    await expect(page.locator('.bulk-count')).toContainText('2');
  });
});

test.describe('Category filter → folder mode', () => {
  test('clicking category shows folder mode in unified bar', async ({ page }) => {
    const categoryRow = page.locator('.thread-row.category-row').first();
    if (await categoryRow.count() === 0) {
      test.skip();
      return;
    }
    await categoryRow.click();

    // Unified bar should show folder mode with back button
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible();
    await expect(page.locator('#unified-bar-back')).toBeVisible();
  });

  test('clicking back from filter returns to inbox', async ({ page }) => {
    const categoryRow = page.locator('.thread-row.category-row').first();
    if (await categoryRow.count() === 0) {
      test.skip();
      return;
    }
    await categoryRow.click();
    await expect(page.locator('.unified-bar[data-mode="folder"]')).toBeVisible();

    await page.locator('#unified-bar-back').click();
    await expect(page.locator('.unified-bar[data-mode="inbox"]')).toBeVisible();
  });
});

test.describe('Keyboard navigation', () => {
  test('j moves selection down', async ({ page }) => {
    // Click on inbox area to ensure focus is not on an input
    await page.locator('.inbox').click();
    await page.keyboard.press('j');

    const selected = page.locator('.thread-row.is-selected');
    await expect(selected).toHaveCount(1);
  });

  test('k moves selection up after going down', async ({ page }) => {
    await page.locator('.inbox').click();
    await page.keyboard.press('j');
    await page.keyboard.press('j');

    // Remember which one is selected
    const secondSelected = await page.locator('.thread-row.is-selected').textContent();

    await page.keyboard.press('k');
    const afterK = await page.locator('.thread-row.is-selected').textContent();

    expect(afterK).not.toBe(secondSelected);
  });

  test('Enter opens selected thread', async ({ page }) => {
    // Navigate past category rows to a real thread, then Enter to open
    await page.locator('.inbox').click();
    await page.waitForSelector('.thread-row:not(.category-row)');
    
    // Keep pressing j until a non-category row is selected
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('j');
      const selected = page.locator('.thread-row.is-selected:not(.category-row)');
      if (await selected.count() > 0) break;
    }
    await expect(page.locator('.thread-row.is-selected:not(.category-row)')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 5000 });
  });
});

test.describe('Data persistence', () => {
  test('archiving a thread persists across reload', async ({ page }) => {
    const initialCount = await page.locator('.thread-row:not(.category-row)').count();

    // Open first non-category thread and archive
    await page.locator('.thread-row:not(.category-row)').first().click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
    await page.locator('[data-action="archive"]').click();

    // On desktop 2-pane, archiving may not close reader — just wait for thread count to update
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 1, { timeout: 5000 });

    // Reload and verify persistence
    await page.reload();
    await page.waitForSelector('.thread-row');
    await expect(page.locator('.thread-row:not(.category-row)')).toHaveCount(initialCount - 1);
  });
});
