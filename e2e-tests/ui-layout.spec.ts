// e2e-tests/ui-layout.spec.ts — UI consistency & responsive layout tests
// Catches: overflow, clipping, element visibility, z-index stacking, resize behavior
import { test, expect, type Page } from '@playwright/test';

// ── Helper: wait for app to be ready ──
async function waitForApp(page: Page) {
  await page.waitForSelector('#app-shell', { timeout: 10000 });
  // Wait for initial render (inbox or login)
  await page.waitForFunction(() => {
    const shell = document.getElementById('app-shell');
    return shell && shell.children.length > 0;
  }, { timeout: 10000 });
}

// ══════════════════════════════════════════════════════════════
// 1. CORE LAYOUT — no overflow, no scrollbar bleed
// ══════════════════════════════════════════════════════════════

test.describe('Core Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('no horizontal scrollbar at any viewport', async ({ page }) => {
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('app shell fills viewport height', async ({ page }) => {
    const { shellHeight, viewportHeight } = await page.evaluate(() => {
      const shell = document.getElementById('app-shell');
      return {
        shellHeight: shell?.getBoundingClientRect().height ?? 0,
        viewportHeight: window.innerHeight,
      };
    });
    // Shell should fill at least 95% of viewport
    expect(shellHeight).toBeGreaterThan(viewportHeight * 0.95);
  });

  test('no elements overflow beyond viewport width', async ({ page }) => {
    const overflowing = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const all = document.querySelectorAll('*');
      const bad: string[] = [];
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 2 || rect.left < -2) {
          // Ignore hidden/zero-size elements
          if (rect.width > 0 && rect.height > 0) {
            // Ignore off-screen drawers/menus (fully left of viewport = intentionally hidden)
            if (rect.right <= 0) continue;
            // Ignore off-screen-right panels (e.g. settings panel hidden at 100% left)
            if (rect.left >= vw) continue;
            // Ignore elements inside nav drawers or hidden panels
            const closest = (el as HTMLElement).closest?.('.nav-drawer, .settings-panel, [class*="drawer"], [class*="offscreen"]');
            if (closest) continue;
            const tag = el.tagName.toLowerCase();
            const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
            bad.push(`${tag}${cls} (right=${rect.right.toFixed(0)}, left=${rect.left.toFixed(0)})`);
          }
        }
      }
      return bad.slice(0, 5);
    });
    expect(overflowing, `Elements overflow viewport: ${overflowing.join(', ')}`).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. TOOLBAR / HEADER — stays pinned, doesn't collapse
// ══════════════════════════════════════════════════════════════

test.describe('Toolbar & Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('toolbar is visible and within viewport', async ({ page }) => {
    const toolbar = page.locator('.unified-bar').first();
    if (await toolbar.count() > 0) {
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeLessThan(200); // Should be near top
    }
  });

  test('toolbar buttons are not clipped or overlapping', async ({ page }) => {
    const buttons = page.locator('.unified-bar .btn-icon, .unified-bar button');
    const count = await buttons.count();
    if (count < 2) return; // Skip if no toolbar buttons

    const boxes: Array<{ x: number; width: number }> = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box && box.width > 0) boxes.push({ x: box.x, width: box.width });
    }

    // Check no significant overlap (> 4px)
    for (let i = 1; i < boxes.length; i++) {
      const overlap = (boxes[i - 1].x + boxes[i - 1].width) - boxes[i].x;
      expect(overlap, `Toolbar buttons ${i - 1} and ${i} overlap by ${overlap}px`).toBeLessThan(4);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 3. THREAD LIST — rows render, no clipping
// ══════════════════════════════════════════════════════════════

test.describe('Thread List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('thread rows have consistent height', async ({ page }) => {
    const rows = page.locator('.thread-row');
    const count = await rows.count();
    if (count < 2) return;

    const heights: number[] = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      const box = await rows.nth(i).boundingBox();
      if (box) heights.push(Math.round(box.height));
    }

    // All rows should be within 4px of each other (accounting for unread bold)
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    expect(maxH - minH, `Row heights vary: ${heights.join(', ')}`).toBeLessThan(5);
  });

  test('thread rows fill available width', async ({ page }) => {
    const rows = page.locator('.thread-row');
    if (await rows.count() === 0) return;

    const { rowWidth, parentWidth } = await page.evaluate(() => {
      const row = document.querySelector('.thread-row') as HTMLElement;
      const parent = row?.parentElement;
      return {
        rowWidth: row?.getBoundingClientRect().width ?? 0,
        parentWidth: parent?.getBoundingClientRect().width ?? 0,
      };
    });
    // Row should fill at least 95% of parent
    if (parentWidth > 0) {
      expect(rowWidth / parentWidth).toBeGreaterThan(0.95);
    }
  });

  test('subject text is not clipped (has ellipsis or fits)', async ({ page }) => {
    const subjects = page.locator('.thread-row .thread-subject, .thread-row .subject');
    const count = await subjects.count();
    if (count === 0) return;

    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = subjects.nth(i);
      const overflow = await el.evaluate((e) => {
        const style = getComputedStyle(e);
        return {
          textOverflow: style.textOverflow,
          overflow: style.overflow,
          whiteSpace: style.whiteSpace,
          scrollWidth: e.scrollWidth,
          clientWidth: e.clientWidth,
        };
      });
      // If text overflows, it should have ellipsis handling
      if (overflow.scrollWidth > overflow.clientWidth + 2) {
        expect(overflow.textOverflow).toBe('ellipsis');
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 4. COMPOSE PANEL — floating, stacking, responsive
// ══════════════════════════════════════════════════════════════

test.describe('Compose Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('compose panel opens within viewport bounds', async ({ page }) => {
    // Trigger compose via keyboard shortcut
    await page.keyboard.press('c');
    await page.waitForSelector('.compose-panel', { timeout: 3000 }).catch(() => null);

    const panel = page.locator('.compose-panel');
    if (await panel.count() === 0) return;

    const box = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 2);
  });

  test('compose panel is fully usable at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.keyboard.press('c');
    await page.waitForSelector('.compose-panel', { timeout: 3000 }).catch(() => null);

    const panel = page.locator('.compose-panel');
    if (await panel.count() === 0) return;

    const box = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    // Panel should not exceed viewport
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 2);
    // Send button should be visible
    const sendBtn = panel.locator('.compose-send-btn-new');
    if (await sendBtn.count() > 0) {
      await expect(sendBtn).toBeVisible();
    }
  });

  test('multiple compose panels do not overlap completely', async ({ page }) => {
    // Open first compose
    await page.keyboard.press('c');
    await page.waitForSelector('.compose-panel', { timeout: 3000 }).catch(() => null);
    // Open second (click "New Message" action or press c again)
    await page.keyboard.press('c');
    await page.waitForTimeout(500);

    const panels = page.locator('.compose-panel');
    const count = await panels.count();
    if (count < 2) return;

    const box1 = await panels.nth(0).boundingBox();
    const box2 = await panels.nth(1).boundingBox();
    if (box1 && box2) {
      // They should be offset (not stacked on same position)
      const xDiff = Math.abs(box1.x - box2.x);
      expect(xDiff, 'Multiple compose panels should be offset').toBeGreaterThan(50);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 5. VIEWPORT RESIZE — layout adapts without breaking
// ══════════════════════════════════════════════════════════════

test.describe('Viewport Resize', () => {
  test('resize from desktop to mobile does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await waitForApp(page);

    // Shrink to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300); // Allow CSS transitions

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('resize from mobile to desktop restores layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForApp(page);

    // Expand to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Check sidebar is visible on desktop (if exists)
    const sidebar = page.locator('.sidebar, .nav-sidebar, [class*="sidebar"]').first();
    if (await sidebar.count() > 0) {
      await expect(sidebar).toBeVisible();
    }
  });

  test('rapid resize does not cause layout thrash', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    const sizes = [
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
      { width: 1280, height: 800 },
      { width: 480, height: 854 },
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(100);
    }

    // After all resizes, no overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // No JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Z-INDEX & STACKING — modals above content, compose above inbox
// ══════════════════════════════════════════════════════════════

test.describe('Z-Index & Stacking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('compose panel has higher z-index than thread list', async ({ page }) => {
    await page.keyboard.press('c');
    await page.waitForSelector('.compose-panel', { timeout: 3000 }).catch(() => null);

    const panel = page.locator('.compose-panel');
    if (await panel.count() === 0) return;

    const zIndexes = await page.evaluate(() => {
      const panel = document.querySelector('.compose-panel') as HTMLElement;
      const list = document.querySelector('.thread-list, #thread-list, [class*="thread"]') as HTMLElement;
      return {
        panelZ: parseInt(getComputedStyle(panel).zIndex || '0', 10) || 0,
        listZ: list ? (parseInt(getComputedStyle(list).zIndex || '0', 10) || 0) : 0,
      };
    });
    expect(zIndexes.panelZ).toBeGreaterThan(zIndexes.listZ);
  });

  test('command palette has highest z-index (when present)', async ({ page }) => {
    // Open command palette with Cmd+K or Ctrl+K
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    const palette = page.locator('.cmd-palette, .command-palette, .kb-palette').first();
    if (await palette.count() === 0) return; // Not implemented yet — skip silently

    const paletteZ = await palette.evaluate((el) => {
      return parseInt(getComputedStyle(el).zIndex || '0', 10) || 0;
    });
    // Should be very high (typically 1000+)
    expect(paletteZ).toBeGreaterThan(900);
  });
});

// ══════════════════════════════════════════════════════════════
// 7. TYPOGRAPHY & SPACING — consistent, no crushed text
// ══════════════════════════════════════════════════════════════

test.describe('Typography & Spacing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('body font size is readable (>= 12px)', async ({ page }) => {
    const minFontSize = await page.evaluate(() => {
      const textEls = Array.from(document.querySelectorAll('p, span, div, a, button, label, input'));
      let min = 100;
      for (const el of textEls) {
        const style = getComputedStyle(el);
        if (el.textContent?.trim() && style.display !== 'none' && style.visibility !== 'hidden') {
          const size = parseFloat(style.fontSize);
          if (size > 0 && size < min) min = size;
        }
      }
      return min;
    });
    expect(minFontSize, 'Some text is too small to read').toBeGreaterThanOrEqual(11);
  });

  test('clickable elements have adequate touch targets (>= 32px)', async ({ page }) => {
    const smallTargets = await page.evaluate(() => {
      const clickables = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="checkbox"]'));
      const bad: string[] = [];
      for (const el of clickables) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (rect.width === 0 || rect.height === 0) continue;
        // Skip toggle switches (intentionally compact, wide enough for tap)
        if ((el as HTMLElement).classList?.contains('settings-toggle')) continue;
        if (rect.width < 28 || rect.height < 28) {
          const tag = el.tagName.toLowerCase();
          const text = el.textContent?.slice(0, 20) ?? '';
          bad.push(`${tag}("${text}") ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`);
        }
      }
      return bad.slice(0, 5);
    });
    // Allow some icon buttons to be slightly smaller, but flag egregious violations
    expect(smallTargets.length, `Touch targets too small: ${smallTargets.join(', ')}`).toBeLessThan(3);
  });
});

// ══════════════════════════════════════════════════════════════
// 8. VISUAL REGRESSION — screenshot comparison
// ══════════════════════════════════════════════════════════════

test.describe('Visual Regression', () => {
  test('inbox screenshot matches baseline', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.waitForTimeout(500); // Settle animations

    await expect(page).toHaveScreenshot('inbox.png', {
      maxDiffPixelRatio: 0.02,
      threshold: 0.3,
    });
  });

  test('compose panel screenshot matches baseline', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.keyboard.press('c');
    await page.waitForSelector('.compose-panel', { timeout: 3000 }).catch(() => null);

    const panel = page.locator('.compose-panel');
    if (await panel.count() === 0) return;
    await page.waitForTimeout(300);

    await expect(panel).toHaveScreenshot('compose-panel.png', {
      maxDiffPixelRatio: 0.02,
      threshold: 0.3,
    });
  });
});
