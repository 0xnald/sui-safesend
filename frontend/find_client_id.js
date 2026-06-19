import fs from 'fs';
import path from 'path';

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        searchDirectory(fullPath);
      }
    } else if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const matches = content.match(/[0-9]+-[a-zA-Z0-9_]+\.apps\.googleusercontent\.com/g);
        if (matches) {
          console.log(`Found in ${fullPath}:`);
          console.log(matches);
        }
      } catch (e) {
        // ignore read errors
      }
    }
  }
}

searchDirectory('node_modules/@mysten');
