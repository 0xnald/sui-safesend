import fs from 'fs';

const content = fs.readFileSync('./node_modules/@naviprotocol/lending/dist/index.esm.js', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.startsWith('const _') || l.startsWith('let _') || l.startsWith('function _') || l.startsWith('var _') || l.includes(' _ =') || l.includes(' _=')) {
    console.log(`Line ${idx+1}: ${l}`);
  }
});
