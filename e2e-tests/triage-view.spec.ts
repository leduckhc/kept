/**
 * E2E: Triage View (Superhuman-style card-based one-at-a-time)
 *
 * Feature: Card-based triage with progress bar, action buttons,
 * keyboard shortcuts, and celebration state when queue is empty.
 *
 * Seed data: 5 unread threads (t01, t02, t03, t09, t15) form the triage queue.
 *
 * Verifies:
 * 1. Switching to Triage view shows triage card (not thread list)
 * 2. Progress bar starts at 0%, advances on action
 * 3. Archive button removes card and advances to next
 * 4. Star button toggles without advancing
 * 5. Skip (mark read) advances to next card
 * 6. Open button opens reader for the current thread
 * 7. Celebration state shows when queue is cleared
 * 8. Keyboard shortcuts (e, s, k, Enter) work in triage
 * 9. Card shows correct sender, subject, snippet
 * 10. Progress stats show "X done" and "Y remaining"
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row', { timeout: 8000 });
  // Switch to Triage view
  await page.locator('.sidebar-btn[data-view="Triage"]').click();
  await page.waitForTimeout(500);
});

test.describe('Triage view — card rendering', () => {
  test('triage container is visible with card', async ({ page }) => {
    await expect(page.locator('.triage-container')).toBeVisible();
    await expect(page.locator('.triage-card')).toBeVisible();
  });

  test('card shows sender name', async ({ page }) => {
    const sender = page.locator('.triage-sender');
    await expect(sender).toBeVisible();
    const text = await sender.textContent();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('card shows subject line', async ({ page }) => {
    const subject = page.locator('.triage-subject');
    await expect(subject).toBeVisible();
    const text = await subject.textContent();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('card shows snippet preview', async ({ page }) => {
    const snippet = page.locator('.triage-snippet');
    await expect(snippet).toBeVisible();
    const text = await snippet.textContent();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('thread list is NOT visible in triage mode', async ({ page }) => {
    await expect(page.locator('#thread-list')).not.toBeVisible();
  });
});

test.describe('Triage view — progress tracking', () => {
  test('progress bar starts near 0%', async ({ page }) => {
    const bar = page.locator('.triage-progress-bar');
    // At 0% width, the bar has no visible area — check its computed width directly
    const width = await bar.evaluate(el => el.style.width);
    expect(parseInt(width)).toBe(0);
  });

  test('stats show "0 done" and remaining count', async ({ page }) => {
    const stats = page.locator('.triage-stats');
    await expect(stats).toContainText('0 done');
    await expect(stats).toContainText('remaining');
  });

  test('after archive, "done" count increments', async ({ page }) => {
    await page.locator('.triage-btn-archive').click();
    await page.waitForTimeout(500);
    const stats = page.locator('.triage-stats');
    await expect(stats).toContainText('1 done');
  });

  test('progress bar width increases after action', async ({ page }) => {
    await page.locator('.triage-btn-archive').click();
    await page.waitForTimeout(500);
    const bar = page.locator('.triage-progress-bar');
    const width = await bar.evaluate(el => el.style.width);
    expect(parseInt(width)).toBeGreaterThan(0);
  });
});

test.describe('Triage view — archive action', () => {
  test('archive button is visible with label', async ({ page }) => {
    const btn = page.locator('.triage-btn-archive');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Archive');
  });

  test('clicking archive advances to next card (different subject)', async ({ page }) => {
    const firstSubject = await page.locator('.triage-subject').textContent();
    await page.locator('.triage-btn-archive').click();
    await page.waitForTimeout(500);

    // A new card should appear (or celebration if only 1 remained)
    const card = page.locator('.triage-card');
    if (await card.isVisible()) {
      const nextSubject = await page.locator('.triage-subject').textContent();
      expect(nextSubject).not.toBe(firstSubject);
    }
  });
});

test.describe('Triage view — star action', () => {
  test('star button is visible with "Star" label', async ({ page }) => {
    const btn = page.locator('.triage-btn-star');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Star');
  });

  test('clicking star does NOT advance card (same subject stays)', async ({ page }) => {
    const subjectBefore = await page.locator('.triage-subject').textContent();
    await page.locator('.triage-btn-star').click();
    await page.waitForTimeout(500);

    const subjectAfter = await page.locator('.triage-subject').textContent();
    expect(subjectAfter).toBe(subjectBefore);
  });

  test('clicking star toggles button text to "Unstar"', async ({ page }) => {
    await page.locator('.triage-btn-star').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.triage-btn-star')).toContainText('Unstar');
  });
});

test.describe('Triage view — skip action', () => {
  test('skip button is visible with "Skip" label', async ({ page }) => {
    const btn = page.locator('.triage-btn-skip');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Skip');
  });

  test('clicking skip advances to next card', async ({ page }) => {
    const firstSubject = await page.locator('.triage-subject').textContent();
    await page.locator('.triage-btn-skip').click();
    await page.waitForTimeout(500);

    const card = page.locator('.triage-card');
    if (await card.isVisible()) {
      const nextSubject = await page.locator('.triage-subject').textContent();
      expect(nextSubject).not.toBe(firstSubject);
    }
  });
});

test.describe('Triage view — open action', () => {
  test('open button is visible', async ({ page }) => {
    await expect(page.locator('.triage-btn-open')).toBeVisible();
  });

  test('clicking open opens the thread reader', async ({ page }) => {
    await page.locator('.triage-btn-open').click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
  });

  test('clicking the card itself also opens reader', async ({ page }) => {
    await page.locator('.triage-card').click();
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
  });
});

test.describe('Triage view — celebration state', () => {
  test('processing all threads shows celebration', async ({ page }) => {
    // Process all 5 unread threads (archive or skip them all)
    for (let i = 0; i < 5; i++) {
      const card = page.locator('.triage-card');
      if (await card.isVisible()) {
        await page.locator('.triage-btn-archive').click();
        await page.waitForTimeout(400);
      }
    }

    // Celebration should appear
    await expect(page.locator('.triage-celebration')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.triage-celebration')).toContainText('All triaged');
  });
});

test.describe('Triage view — keyboard shortcuts', () => {
  test('pressing "e" archives and advances', async ({ page }) => {
    const firstSubject = await page.locator('.triage-subject').textContent();
    await page.keyboard.press('e');
    await page.waitForTimeout(500);

    const card = page.locator('.triage-card');
    if (await card.isVisible()) {
      const nextSubject = await page.locator('.triage-subject').textContent();
      expect(nextSubject).not.toBe(firstSubject);
    }
    await expect(page.locator('.triage-stats')).toContainText('1 done');
  });

  test('pressing "s" stars without advancing', async ({ page }) => {
    const subjectBefore = await page.locator('.triage-subject').textContent();
    await page.keyboard.press('s');
    await page.waitForTimeout(500);
    const subjectAfter = await page.locator('.triage-subject').textContent();
    expect(subjectAfter).toBe(subjectBefore);
  });

  test('pressing "k" skips (mark read) and advances', async ({ page }) => {
    const firstSubject = await page.locator('.triage-subject').textContent();
    await page.keyboard.press('k');
    await page.waitForTimeout(500);

    const card = page.locator('.triage-card');
    if (await card.isVisible()) {
      const nextSubject = await page.locator('.triage-subject').textContent();
      expect(nextSubject).not.toBe(firstSubject);
    }
  });

  test('pressing Enter opens thread reader', async ({ page }) => {
    await page.keyboard.press('Enter');
    await expect(page.locator('#app-shell')).toHaveClass(/reader-open/, { timeout: 3000 });
  });
});

test.describe('Triage view — keyboard hint', () => {
  test('keyboard hints are visible', async ({ page }) => {
    const hint = page.locator('.triage-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('archive');
    await expect(hint).toContainText('star');
    await expect(hint).toContainText('skip');
    await expect(hint).toContainText('open');
  });
});
