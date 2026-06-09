import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

/** Helper: open a thread by subject text */
async function openThread(page: import('@playwright/test').Page, subjectText: string) {
  await page.locator('.thread-row', { hasText: subjectText }).click();
  await expect(page.locator('#app-shell')).toHaveClass(/reader-open/);
  await page.waitForSelector('.thread-message', { timeout: 5000 });
}

/** Helper: expand Updates category if needed */
async function expandUpdates(page: import('@playwright/test').Page) {
  const category = page.locator('.category-row', { hasText: 'Updates' });
  if (await category.isVisible()) {
    await category.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Attachments - Thread Reader', () => {
  test('attachment chips show with correct filenames and sizes', async ({ page }) => {
    // Resume thread is in primary inbox — has 2 attachments
    await openThread(page, 'resume');

    const chips = page.locator('.attachment-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('headshot.jpg');
    await expect(chips.nth(1)).toContainText('resume-v3.pdf');
  });

  test('attachment section only appears on messages that have attachments', async ({ page }) => {
    // Resume thread (t11) — 2 messages, only one has attachments
    await openThread(page, 'resume');

    const sections = page.locator('.attachment-section');
    // Should be 1 section (only on the message with attachments)
    await expect(sections).toHaveCount(1);
  });

  test('messages without attachments have no attachment section', async ({ page }) => {
    // Project kickoff (t06) — 3 messages, only m06c has attachment
    await openThread(page, 'Project kickoff');

    // Only 1 section for the one message that has an attachment
    const sections = page.locator('.attachment-section');
    await expect(sections).toHaveCount(1);
    await expect(page.locator('.attachment-chip')).toContainText('revised-schedule.xlsx');
  });

  test('attachment chips are clickable', async ({ page }) => {
    await openThread(page, 'resume');

    const chip = page.locator('.attachment-chip').first();
    await expect(chip).toHaveCSS('cursor', 'pointer');
  });

  test('MIME type icons are correct', async ({ page }) => {
    // Resume thread has image + pdf
    await openThread(page, 'resume');

    const chips = page.locator('.attachment-chip');
    // Image should have 🖼️
    await expect(chips.nth(0)).toContainText('🖼️');
    // PDF should have 📄
    await expect(chips.nth(1)).toContainText('📄');
  });
});

test.describe('Attachments - Compose', () => {
  test('compose panel has attach button', async ({ page }) => {
    await page.locator('.btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible();

    const attachBtn = page.locator('.compose-panel-footer .btn-icon[title="Attach file"]');
    await expect(attachBtn).toBeVisible();
  });

  test('file input adds attachment chips to compose', async ({ page }) => {
    await page.locator('.btn-compose').click();
    await expect(page.locator('.compose-panel')).toBeVisible();

    // Programmatically add files via the hidden input
    const fileInput = page.locator('.compose-panel input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake pdf') },
      { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake img') },
    ]);

    const chips = page.locator('.compose-attachment-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('report.pdf');
    await expect(chips.nth(1)).toContainText('photo.jpg');
  });

  test('remove button removes attachment chip', async ({ page }) => {
    await page.locator('.btn-compose').click();

    const fileInput = page.locator('.compose-panel input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('data') },
    ]);

    await expect(page.locator('.compose-attachment-chip')).toHaveCount(1);

    // Click the × remove button
    await page.locator('.compose-attachment-remove').click();
    await expect(page.locator('.compose-attachment-chip')).toHaveCount(0);
  });

  test('drag-over state adds visual class', async ({ page }) => {
    await page.locator('.btn-compose').click();
    const panel = page.locator('.compose-panel');
    await expect(panel).toBeVisible();

    // Simulate dragover in browser context
    await panel.evaluate((el) => {
      const event = new DragEvent('dragover', { bubbles: true, dataTransfer: new DataTransfer() });
      el.dispatchEvent(event);
    });
    await expect(panel).toHaveClass(/compose-drag-over/);
  });
});
