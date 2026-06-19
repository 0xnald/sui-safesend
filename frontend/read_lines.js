import fs from 'fs';

const content = fs.readFileSync('./node_modules/@naviprotocol/lending/dist/index.esm.js', 'utf8');
const lines = content.split('\n');
for (let i = 1980; i < 2060; i++) {
  if (lines[i]) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}
