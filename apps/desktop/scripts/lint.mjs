import { readFile } from 'node:fs/promises';
const src = await readFile('src/main.js', 'utf8');
if (src.includes('console.log(')) throw new Error('no console.log in app source');
console.log('desktop lint passed');
