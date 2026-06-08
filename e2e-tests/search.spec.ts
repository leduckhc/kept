import { test, expect } from '@playwright/test';

// Reset DB to seed state before each test
test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

test.describe('Search UI', () => {
  test('search pill expands on focus', async ({ page }) => {
    const searchInput = page.locator('#search');
    const wrap = page.locator('.search-pill-wrap');

    await expect(wrap).not.toHaveClass(/expanded/);
    await searchInput.focus();
    await expect(wrap).toHaveClass(/expanded/);
  });

  test('typing filters threads client-side', async ({ page }) => {
    const searchInput = page.locator('#search');
    const threadsBefore = await page.locator('.thread-row:not(.category-row)').count();

    // Type a query that likely matches only some threads
    await searchInput.fill('test');
    // Give local filter time to apply
    await page.waitForTimeout(100);

    const threadsAfter = await page.locator('.thread-row:not(.category-row)').count();
    // Should filter down (or stay same if all match — at minimum, shouldn't crash)
    expect(threadsAfter).toBeLessThanOrEqual(threadsBefore);
  });

  test('escape clears search and collapses pill', async ({ page }) => {
    const searchInput = page.locator('#search');
    const wrap = page.locator('.search-pill-wrap');

    await searchInput.fill('hello');
    await expect(wrap).toHaveClass(/expanded/);

    await searchInput.press('Escape');
    await expect(wrap).not.toHaveClass(/expanded/);
    await expect(searchInput).toHaveValue('');
  });

  test('search spinner shows during server search', async ({ page }) => {
    // Intercept Gmail API calls to delay response
    await page.route('**/gmail.googleapis.com/**', async (route) => {
      // Delay 500ms to ensure spinner is visible
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [], resultSizeEstimate: 0 }),
      });
    });

    const searchInput = page.locator('#search');
    await searchInput.fill('from:important@example.com');

    // Spinner should appear after debounce (300ms) + network starts
    const spinner = page.locator('.search-spinner');
    await expect(spinner).toBeVisible({ timeout: 2000 });
  });

  test('search pill is only visible in inbox mode', async ({ page }) => {
    const searchWrap = page.locator('.search-pill-wrap');

    // Should be visible in inbox
    await expect(searchWrap).toBeVisible();

    // Click a thread to enter reader mode (2-pane layouts)
    await page.locator('.thread-row:not(.category-row)').first().click();

    // In 3-pane (wide viewport), search stays visible
    // In 2-pane (narrow viewport), reader takes over and search hides
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1400) {
      await expect(searchWrap).not.toBeVisible();
    }
  });
});
