import { test, expect } from '@playwright/test';

/**
 * UX/UI design system tests — covers recent visual overhaul:
 * - Dark mode colors and hover states
 * - Unread dot positioning and visibility
 * - Responsive thread row layout (full / medium / small)
 * - Collapsible search bar (pill expand)
 * - Hamburger icon consistency
 * - Border radius consistency (20px pill)
 * - Inbox width override at narrow viewports
 */

test.describe('Design tokens & dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.thread-row');
  });

  test('dark mode --bg variable is #1f2121', async ({ page }) => {
    // Enable dark mode via the app's own API
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(100);
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#1f2121');
  });

  test('dark mode --surface-hover is #2a2c2c (neutral, not purple)', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(100);
    const hover = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--surface-hover').trim()
    );
    expect(hover).toBe('#2a2c2c');
  });

  test('light mode --surface-hover is #f0f0f0', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.waitForTimeout(100);
    const hover = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--surface-hover').trim()
    );
    expect(hover).toBe('#f0f0f0');
  });
});

test.describe('Unread dot', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.thread-row');
  });

  test('unread dot column is 4px wide (close to avatar)', async ({ page }) => {
    const row = page.locator('.thread-row').first();
    const columns = await row.evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    );
    // First column should be 4px
    const firstCol = columns.split(' ')[0];
    expect(parseFloat(firstCol)).toBeLessThanOrEqual(4);
  });

  test('unread row shows visible blue dot', async ({ page }) => {
    const unreadRow = page.locator('.thread-row.unread').first();
    if (await unreadRow.count() === 0) {
      test.skip();
      return;
    }
    const dot = unreadRow.locator('.unread-dot');
    await expect(dot).toBeVisible();
    const bg = await dot.evaluate(el => getComputedStyle(el).backgroundColor);
    // Should have a non-transparent background (accent color)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });

  test('read row has invisible dot (no background)', async ({ page }) => {
    const readRow = page.locator('.thread-row:not(.unread)').first();
    if (await readRow.count() === 0) {
      test.skip();
      return;
    }
    const dot = readRow.locator('.unread-dot');
    const bg = await dot.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBeTruthy();
  });

  test('unread dot is 7px diameter', async ({ page }) => {
    const dot = page.locator('.thread-row .unread-dot').first();
    const size = await dot.evaluate(el => {
      const s = getComputedStyle(el);
      return { w: s.width, h: s.height };
    });
    expect(size.w).toBe('7px');
    expect(size.h).toBe('7px');
  });

  test('category rows include unread-dot placeholder for grid alignment', async ({ page }) => {
    const categoryRow = page.locator('.category-row').first();
    if (await categoryRow.count() === 0) {
      test.skip();
      return;
    }
    const dot = categoryRow.locator('.unread-dot');
    await expect(dot).toHaveCount(1);
  });
});

test.describe('Responsive thread row layout', () => {
  test('full width: single-line row with 5 grid columns', async ({ page }) => {
    // desktop-1920 project
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForSelector('.thread-row');
    const row = page.locator('.thread-row').first();
    const columns = await row.evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    );
    // Should have 5 values: 4px 40px 212px 1fr auto
    const parts = columns.split(' ').filter(Boolean);
    expect(parts.length).toBeGreaterThanOrEqual(5);
  });

  test('medium width (768px): 2-line layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForSelector('.thread-row');
    const row = page.locator('.thread-row').first();
    const rows = await row.evaluate(el =>
      getComputedStyle(el).gridTemplateRows
    );
    // Should have 2 row values (auto auto)
    const parts = rows.split(' ').filter(s => s !== '0px' && s !== '');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  test('small width (375px): 3-line layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('.thread-row');
    const row = page.locator('.thread-row').first();
    const rows = await row.evaluate(el =>
      getComputedStyle(el).gridTemplateRows
    );
    // Should have 3 row values
    const parts = rows.split(' ').filter(s => s !== '0px' && s !== '');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Collapsible search bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.toolbar');
  });

  test('search pill toggle button exists in toolbar', async ({ page }) => {
    const btn = page.locator('#btn-search-toggle');
    await expect(btn).toBeVisible();
  });

  test('search starts collapsed', async ({ page }) => {
    const wrap = page.locator('#toolbar-search-wrap');
    await expect(wrap).toHaveClass(/collapsed/);
  });

  test('clicking search toggle expands the pill', async ({ page }) => {
    await page.click('#btn-search-toggle');
    const wrap = page.locator('#toolbar-search-wrap');
    await expect(wrap).not.toHaveClass(/collapsed/);
    const input = page.locator('#search');
    await expect(input).toBeVisible();
  });

  test('Cmd+F expands search', async ({ page }) => {
    await page.keyboard.press('Meta+f');
    const wrap = page.locator('#toolbar-search-wrap');
    // Give animation time
    await page.waitForTimeout(300);
    await expect(wrap).not.toHaveClass(/collapsed/);
  });

  test('Escape collapses search', async ({ page }) => {
    await page.click('#btn-search-toggle');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const wrap = page.locator('#toolbar-search-wrap');
    await expect(wrap).toHaveClass(/collapsed/);
  });
});

test.describe('Toolbar & icons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.toolbar');
  });

  test('hamburger button contains SVG icon (not text character)', async ({ page }) => {
    const btn = page.locator('#btn-hamburger');
    const hasSvg = await btn.evaluate(el => el.querySelector('svg') !== null);
    expect(hasSvg).toBe(true);
  });

  test('compose button contains SVG icon', async ({ page }) => {
    const btn = page.locator('#btn-compose');
    const hasSvg = await btn.evaluate(el => el.querySelector('svg') !== null);
    expect(hasSvg).toBe(true);
  });

  test('hamburger and compose icons are same size (18px)', async ({ page }) => {
    const hamburgerSize = await page.locator('#btn-hamburger svg').evaluate(el => ({
      w: el.getAttribute('width'),
      h: el.getAttribute('height'),
    }));
    const composeSize = await page.locator('#btn-compose svg').evaluate(el => ({
      w: el.getAttribute('width'),
      h: el.getAttribute('height'),
    }));
    expect(hamburgerSize.w).toBe('18px');
    expect(composeSize.w).toBe('18px');
  });
});

test.describe('Thread row border radius (pill style)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.thread-row');
  });

  test('thread rows have 20px border radius', async ({ page }) => {
    const row = page.locator('.thread-row').first();
    const radius = await row.evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('20px');
  });
});

test.describe('Inbox width at narrow viewport', () => {
  test('inbox fills available width below 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    await page.waitForSelector('.inbox');
    const inboxWidth = await page.locator('.inbox').evaluate(el => el.getBoundingClientRect().width);
    // Should be most of viewport (minus sidebar ~48px)
    expect(inboxWidth).toBeGreaterThan(800);
  });
});

test.describe('Thread row hover actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.thread-row');
  });

  test('hover shows action buttons, hides date', async ({ page }) => {
    const row = page.locator('.thread-row').first();
    // Before hover: actions hidden
    const actionsBefore = await row.locator('.thread-actions').evaluate(el =>
      getComputedStyle(el).display
    );
    expect(actionsBefore).toBe('none');

    await row.hover();
    await page.waitForTimeout(150);

    const actionsAfter = await row.locator('.thread-actions').evaluate(el =>
      getComputedStyle(el).display
    );
    expect(actionsAfter).toBe('flex');

    // Date should be hidden on hover — check via CSS rule presence
    const dateHidden = await row.evaluate(el => {
      const date = el.querySelector('.thread-date');
      return date ? getComputedStyle(date).display === 'none' : true;
    });
    expect(dateHidden).toBe(true);
  });
});

test.describe('Sender column width', () => {
  test('sender column is 212px at full desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForSelector('.thread-row');
    const row = page.locator('.thread-row').first();
    const columns = await row.evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    );
    // Third value should be around 212px
    const parts = columns.split(' ');
    const senderCol = parseFloat(parts[2]);
    expect(senderCol).toBeCloseTo(212, 0);
  });
});
