import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await cp('index.html', 'dist/index.html');
await cp('favicon.svg', 'dist/favicon.svg');
await cp('src', 'dist/src', { recursive: true });
await cp('../../packages', 'dist/packages', {
  recursive: true,
  filter: (source) => !source.includes('/node_modules/') && !source.includes('/test/'),
});

for (const packagedPath of ['dist/src/main.ts', 'dist/src/tauri-gmail-bridge.ts']) {
  const packagedSource = await readFile(packagedPath, 'utf8');
  // Rewrite both legacy root-absolute '/packages/' and NodeNext-relative '../../packages/' to '../packages/'
  const rewritten = packagedSource
    .replaceAll("from '/packages/", "from '../packages/")
    .replaceAll("from '../../packages/", "from '../packages/");
  await writeFile(packagedPath, rewritten);
}

console.log('desktop static shell built with Tauri-safe runtime assets');
