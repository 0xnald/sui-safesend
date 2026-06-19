import fs from 'fs';
import path from 'path';

function listFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        listFiles(fullPath);
      }
    } else {
      console.log(fullPath);
    }
  }
}

listFiles('./node_modules/@naviprotocol/lending');
