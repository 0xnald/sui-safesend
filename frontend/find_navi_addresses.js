import fs from 'fs';
import path from 'path';

function searchInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInDir(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.d.ts') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('testnet') || content.includes('0x')) {
        console.log(`File: ${fullPath}`);
        // print lines containing testnet
        const lines = content.split('\n');
        lines.forEach((l, i) => {
          if (l.includes('testnet') || l.includes('packageId') || l.includes('address')) {
            console.log(`  Line ${i+1}: ${l.substring(0, 120)}`);
          }
        });
      }
    }
  }
}

searchInDir('./node_modules/@naviprotocol/lending');
