import fs from 'fs';

const content = fs.readFileSync('./node_modules/@naviprotocol/lending/dist/index.esm.js', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.startsWith('const D ') || l.startsWith('let D ') || l.startsWith('var D ') || l.includes(' D =') || l.includes(' D=')) {
    console.log(`Line ${idx+1}: ${l}`);
  }
});
