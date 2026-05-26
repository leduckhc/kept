import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/desktop/index.html',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'packages/ui/src/index.js',
  'packages/mail-core/src/index.js',
  'packages/search-core/src/index.js',
  'packages/ai-core/src/index.js',
  'apps/desktop/dist/index.html',
  'apps/desktop/dist/src/main.js',
  'apps/desktop/dist/src/styles.css',
  'apps/desktop/dist/packages/ui/src/index.js',
  'apps/desktop/dist/packages/mail-core/src/index.js',
  'apps/desktop/dist/packages/ai-core/src/index.js',
];

for (const path of required) await access(path);

const tauri = JSON.parse(await readFile('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));
if (tauri.productName !== 'Kept') throw new Error('Tauri productName must be Kept');

const distIndex = await readFile('apps/desktop/dist/index.html', 'utf8');
if (!distIndex.includes('./src/main.js')) {
  throw new Error('desktop dist index must load the Kept runtime script');
}

console.log('Tauri scaffold check passed');
