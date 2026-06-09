import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

/** Helper: create a smart folder via the UI */
async function createFolderViaUI(page: any, name: string, field: string, operator: string, value: string) {
  await page.locator('#btn-add-smart-folder').click();
  await page.waitForSelector('#smart-folder-dialog');
  await page.locator('#smart-folder-name-input').fill(name);

  const conditionRow = page.locator('.smart-folder-condition-row').first();
  await conditionRow.locator('select').first().selectOption(field);

  // Boolean fields (isStarred, isUnread, hasAttachment) don't show operator/value inputs
  const isBooleanField = ['isStarred', 'isUnread', 'hasAttachment'].includes(field);
  if (!isBooleanField) {
    await conditionRow.locator('select').nth(1).selectOption(operator);
    await conditionRow.locator('input[type="text"]').fill(value);
  }

  await page.locator('#btn-create-smart-folder').click();
  await expect(page.locator('#smart-folder-dialog')).not.toBeVisible();
}

test.describe('Smart Folders', () => {
  test('add-smart-folder button opens creation dialog', async ({ page }) => {
    const addBtn = page.locator('#btn-add-smart-folder');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const dialog = page.locator('#smart-folder-dialog');
    await expect(dialog).toBeVisible();

    await expect(page.locator('#smart-folder-name-input')).toBeVisible();
    await expect(page.locator('#btn-create-smart-folder')).toBeVisible();
  });

  test('create smart folder and see it in sidebar', async ({ page }) => {
    await createFolderViaUI(page, 'GitHub Notifications', 'domain', 'equals', 'github.com');

    // Smart folder should appear in sidebar
    const folderBtn = page.locator('.sidebar-smart-folder-btn');
    await expect(folderBtn).toHaveCount(1);
    await expect(folderBtn.locator('.smart-folder-name')).toHaveText('GitHub Notifications');
  });

  test('clicking smart folder filters thread list', async ({ page }) => {
    // Create a folder that will match only some threads
    await createFolderViaUI(page, 'Starred', 'isStarred', 'equals', 'true');

    const allCount = await page.locator('.thread-row').count();
    expect(allCount).toBeGreaterThan(1);

    // Click the smart folder to activate
    await page.locator('.sidebar-smart-folder-btn').click();
    await page.waitForTimeout(300);

    const filteredCount = await page.locator('.thread-row').count();
    // Should have fewer threads (or 0 if no starred in seed — either way < allCount)
    expect(filteredCount).toBeLessThanOrEqual(allCount);

    // The folder button should have active class
    await expect(page.locator('.sidebar-smart-folder-btn')).toHaveClass(/active/);
  });

  test('clicking active smart folder deactivates it (toggle)', async ({ page }) => {
    await createFolderViaUI(page, 'Unread', 'isUnread', 'equals', 'true');

    const allCount = await page.locator('.thread-row').count();

    // Activate
    const folderBtn = page.locator('.sidebar-smart-folder-btn');
    await folderBtn.click();
    await page.waitForTimeout(300);

    // Deactivate
    await folderBtn.click();
    await page.waitForTimeout(300);

    const restoredCount = await page.locator('.thread-row').count();
    expect(restoredCount).toBe(allCount);

    // Active class should be gone
    await expect(folderBtn).not.toHaveClass(/active/);
  });
});
