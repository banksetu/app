import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('portfolio-dist', { recursive: true });
for (const name of ['version.json', 'release.json', 'favicon.png', 'icon-192.png', 'icon-512.png']) copyFileSync(`public/${name}`, `portfolio-dist/${name}`);
mkdirSync('portfolio-dist/client-bridge', {recursive:true});
copyFileSync('apps-script/Code.gs', 'portfolio-dist/client-bridge/Code.gs');
