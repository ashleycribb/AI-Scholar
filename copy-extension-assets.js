import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'extension');
const destDir = path.join(__dirname, 'dist-extension');

// Ensure dist-extension exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy common.css
const contentScriptsDest = path.join(destDir, 'content-scripts');
if (!fs.existsSync(contentScriptsDest)) {
  fs.mkdirSync(contentScriptsDest, { recursive: true });
}
fs.copyFileSync(path.join(srcDir, 'content-scripts', 'common.css'), path.join(contentScriptsDest, 'common.css'));

console.log('Extension assets copied successfully.');
