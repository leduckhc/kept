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

for (const packagedPath of ['dist/src/main.js', 'dist/src/tauri-gmail-bridge.js']) {
  const packagedSource = await readFile(packagedPath, 'utf8');
  await writeFile(packagedPath, packagedSource.replaceAll("from '/packages/", "from '../packages/"));
}

console.log('desktop static shell built with Tauri-safe runtime assets');
