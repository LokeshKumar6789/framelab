import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(resolve(root, 'dist', src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g, (_, href) => {
  const css = readFileSync(resolve(root, 'dist', href), 'utf8');
  return `<style>${css}</style>`;
});
const favicon = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');
html = html.replace('./favicon.svg', `data:image/svg+xml,${encodeURIComponent(favicon)}`);
writeFileSync(resolve(root, 'dist/framelab-offline.html'), html);
console.log('Created dist/framelab-offline.html — self-contained, no installation required.');
