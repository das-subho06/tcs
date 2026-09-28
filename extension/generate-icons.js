const fs = require('fs');
const path = require('path');

// Minimal 1x1 transparent PNG buffer
const minimalPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzx5Z5xAAAAABJRU5ErkJggg==',
  'base64'
);

const iconDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

fs.writeFileSync(path.join(iconDir, 'icon16.png'), minimalPng);
fs.writeFileSync(path.join(iconDir, 'icon48.png'), minimalPng);
fs.writeFileSync(path.join(iconDir, 'icon128.png'), minimalPng);
console.log('Extension icons created.');
