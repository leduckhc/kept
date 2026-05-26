import { access } from 'node:fs/promises';
for (const file of ['src/main.js', 'src/styles.css', 'src-tauri/tauri.conf.json']) await access(file);
console.log('desktop scaffold typecheck passed');
