import fs from 'fs';

const content = fs.readFileSync('./node_modules/@naviprotocol/lending/dist/index.esm.js', 'utf8');

// Find the getConfig function
const match = content.match(/function getConfig\([\s\S]*?\}\n/);
if (match) {
  console.log("getConfig Implementation:");
  console.log(match[0]);
} else {
  console.log("getConfig function not found, searching for config objects...");
  // Let's print occurrences of 'getConfig'
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('getConfig') || l.includes('testnet') || l.includes('packageId')) {
      if (l.length < 300) {
        console.log(`Line ${idx+1}: ${l}`);
      }
    }
  });
}
