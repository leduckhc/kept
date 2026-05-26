import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });
await cp('../../packages', 'dist/packages', {
  recursive: true,
  filter: (source) => !source.includes('/node_modules/') && !source.includes('/test/'),
});

const packagedMainPath = 'dist/src/main.js';
const packagedMain = await readFile(packagedMainPath, 'utf8');
await writeFile(packagedMainPath, packagedMain.replaceAll("from '/packages/", "from '../packages/"));

console.log('desktop static shell built with Tauri-safe runtime assets');
