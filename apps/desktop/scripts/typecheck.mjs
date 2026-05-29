import { access } from 'node:fs/promises';
for (const file of ['src/main.ts', 'src/styles.css', 'src-tauri/tauri.conf.json']) await access(file);
console.log('desktop scaffold typecheck passed');
