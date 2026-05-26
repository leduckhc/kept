import { access, readFile } from 'node:fs/promises';
const required = [
  'apps/desktop/index.html',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'packages/ui/src/index.js',
  'packages/mail-core/src/index.js',
  'packages/search-core/src/index.js',
  'packages/ai-core/src/index.js',
];
for (const path of required) await access(path);
const tauri = JSON.parse(await readFile('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));
if (tauri.productName !== 'Kept') throw new Error('Tauri productName must be Kept');
console.log('Tauri scaffold check passed');
