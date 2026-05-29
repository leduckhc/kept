import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/desktop/index.html',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'packages/ui/src/index.ts',
  'packages/mail-core/src/index.ts',
  'packages/search-core/src/index.ts',
  'packages/ai-core/src/index.ts',
  'apps/desktop/dist/index.html',
  'apps/desktop/dist/src/main.ts',
  'apps/desktop/dist/src/tauri-gmail-bridge.ts',
  'apps/desktop/dist/src/tauri-gmail-bridge-core.ts',
  'apps/desktop/dist/src/styles.css',
  'apps/desktop/dist/packages/ui/src/index.ts',
  'apps/desktop/dist/packages/mail-core/src/index.ts',
  'apps/desktop/dist/packages/ai-core/src/index.ts',
];

for (const path of required) await access(path);

const tauri = JSON.parse(await readFile('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));
if (tauri.productName !== 'Kept') throw new Error('Tauri productName must be Kept');

const distIndex = await readFile('apps/desktop/dist/index.html', 'utf8');
if (!distIndex.includes('./src/main.ts')) {
  throw new Error('desktop dist index must load the Kept runtime script');
}

const distMain = await readFile('apps/desktop/dist/src/main.ts', 'utf8');
const distBridge = await readFile('apps/desktop/dist/src/tauri-gmail-bridge.ts', 'utf8');
if (!distIndex.includes('./src/tauri-gmail-bridge.ts')) {
  throw new Error('desktop dist index must load the Tauri Gmail bridge before the Kept runtime script');
}
if (distIndex.indexOf('./src/tauri-gmail-bridge.ts') > distIndex.indexOf('./src/main.ts')) {
  throw new Error('desktop dist index must load the Tauri Gmail bridge before main.ts');
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
