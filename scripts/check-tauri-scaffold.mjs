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
  'apps/desktop/dist/src/tauri-gmail-bridge.js',
  'apps/desktop/dist/src/tauri-gmail-bridge-core.js',
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

const distMain = await readFile('apps/desktop/dist/src/main.js', 'utf8');
const distBridge = await readFile('apps/desktop/dist/src/tauri-gmail-bridge.js', 'utf8');
if (!distIndex.includes('./src/tauri-gmail-bridge.js')) {
  throw new Error('desktop dist index must load the Tauri Gmail bridge before the Kept runtime script');
}
if (distIndex.indexOf('./src/tauri-gmail-bridge.js') > distIndex.indexOf('./src/main.js')) {
  throw new Error('desktop dist index must load the Tauri Gmail bridge before main.js');
}
if (distMain.includes("from '/packages/") || distBridge.includes("from '/packages/")) {
  throw new Error('desktop dist runtime must not use root-absolute package imports; Tauri packaged app needs relative imports');
}
if (!distMain.includes("from '../packages/") || !distBridge.includes("from '../packages/")) {
  throw new Error('desktop dist runtime must load packaged workspace modules with relative imports');
}
if (distMain.includes('sampleInboxThreads') || distMain.includes('Synthetic preview:')) {
  throw new Error('desktop dist must not ship the inbox as mock-only sample data');
}

console.log('Tauri scaffold check passed');
