import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const boardPath = path.resolve(__dirname, '../docs/designs/real-mail-alpha-state-matrix/comparison-board.html');
const outputDir = path.resolve(__dirname, '../docs/designs/real-mail-alpha-state-matrix/screenshots');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1660, height: 4200 }, deviceScaleFactor: 1.5 });
await page.goto(`file://${boardPath}`);
await page.screenshot({ path: path.join(outputDir, 'board-full.png'), fullPage: true });

for (const id of ['variant-a', 'variant-b', 'variant-c']) {
  const locator = page.locator(`#${id}`);
  await locator.screenshot({ path: path.join(outputDir, `${id}.png`) });
}

await browser.close();
console.log(outputDir);
