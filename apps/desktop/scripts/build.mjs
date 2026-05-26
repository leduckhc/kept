import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });
await cp('../../packages', 'dist/packages', {
  recursive: true,
  filter: (source) => !source.includes('/node_modules/') && !source.includes('/test/'),
});

console.log('desktop static shell built with runtime assets');
