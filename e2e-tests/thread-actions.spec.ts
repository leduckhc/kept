import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

/** Helper: open the first non-category thread and wait for reader */
async function openFirstThread(page: import('@playwright/test').Page) {
  await page.locator('.thread-row:not(.category-row)').first().click();
  await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  // Wait for message content to load
  await page.waitForSelector('.thread-message', { timeout: 5000 });
}

test.describe('Thread Actions - Per-message', () => {
  test('per-message action buttons are always visible', async ({ page }) => {
    await openFirstThread(page);

    // Action buttons should be visible (always shown, not hover-only)
    const actions = page.locator('.msg-actions').first();
    await expect(actions).toBeVisible();
  });

  test('reply button opens inline compose with correct recipient', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    // Expand if collapsed
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: /^Reply$/ }).click();

    // Inline compose should appear
    await expect(page.locator('.inline-compose')).toBeVisible();
    await expect(page.locator('.inline-compose-label')).toHaveText('Reply');

    // To field should be populated
    const toInput = page.locator('#inline-compose-to');
    await expect(toInput).not.toHaveValue('');
  });

  test('reply all button shows Reply All label', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: 'Reply All' }).click();

    await expect(page.locator('.inline-compose')).toBeVisible();
    await expect(page.locator('.inline-compose-label')).toHaveText('Reply All');
  });

  test('forward button opens floating compose panel', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: 'Forward' }).click();

    // Forward opens the floating compose panel (not inline)
    await expect(page.locator('.compose-panel')).toBeVisible();
  });
});

test.describe('Inline Compose', () => {
  test('close button dismisses inline compose', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: /^Reply$/ }).click();

    await expect(page.locator('.inline-compose')).toBeVisible();
    await page.locator('.inline-compose-close').click();
    await expect(page.locator('.inline-compose')).not.toBeVisible();
  });

  test('footer reply buttons hidden when inline compose is open', async ({ page }) => {
    await openFirstThread(page);

    // Footer should be visible initially
    await expect(page.locator('.reader-footer')).toBeVisible();

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: /^Reply$/ }).click();

    // Footer should disappear
    await expect(page.locator('.reader-footer')).not.toBeVisible();
  });

  test('inline compose body is editable', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    await msg.hover();
    await msg.locator('.msg-action-btn', { hasText: /^Reply$/ }).click();

    const body = page.locator('#inline-compose-body');
    await body.fill('Hello from inline reply');
    await expect(body).toHaveValue('Hello from inline reply');
  });
});

test.describe('Quote Selection Reply', () => {
  test('selecting text in message shows quote popup', async ({ page }) => {
    await openFirstThread(page);

    // Last message should be expanded
    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    const bodyEl = msg.locator('.email-body-rendered');
    await expect(bodyEl).toBeVisible();

    // Triple-click to select text in body
    await bodyEl.click({ clickCount: 3 });

    // Quote popup should appear
    await expect(page.locator('.quote-popup')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.quote-popup-btn')).toHaveText('Reply with quote');
  });

  test('clicking quote reply opens inline compose with quoted text', async ({ page }) => {
    await openFirstThread(page);

    const msg = page.locator('.thread-message').last();
    if (await msg.evaluate(el => el.classList.contains('thread-message-collapsed'))) {
      await msg.locator('.thread-message-header').click();
      await page.waitForTimeout(200);
    }

    const bodyEl = msg.locator('.email-body-rendered');
    await expect(bodyEl).toBeVisible();

    // Select text
    await bodyEl.click({ clickCount: 3 });
    await page.waitForSelector('.quote-popup', { timeout: 2000 });

    // Click quote reply
    await page.locator('.quote-popup-btn').click();

    // Inline compose should open with quoted text
    await expect(page.locator('.inline-compose')).toBeVisible();
    const body = page.locator('#inline-compose-body');
    const value = await body.inputValue();
    expect(value).toContain('>');
  });
});
