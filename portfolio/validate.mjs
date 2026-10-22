import { readFileSync, existsSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./content/site.json', import.meta.url)));
for (const key of ['title', 'hero', 'description', 'banner', 'downloadText', 'footer']) {
  if (typeof data[key] !== 'string' || !data[key].trim()) throw Error(`Invalid portfolio content: ${key}`);
}
if (!Array.isArray(data.features) || !data.features.every(x => typeof x.title === 'string' && typeof x.text === 'string')) throw Error('Invalid features');
if (!Array.isArray(data.screenshots) || !data.screenshots.every(x => typeof x.src === 'string' && typeof x.alt === 'string' && x.src.startsWith('/screenshots/'))) throw Error('Invalid screenshots');
for (const image of data.screenshots) {
  if (image.src.includes('..') || !existsSync(new URL(`./public${image.src}`, import.meta.url))) throw Error(`Missing screenshot: ${image.src}`);
}
for (const color of Object.values(data.theme)) if (typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color)) throw Error('Invalid theme color');
const manifest = JSON.parse(readFileSync(new URL('../public/version.json', import.meta.url)));
for (const platform of ['windowsDownloadUrl', 'androidDownloadUrl']) {
  const url = new URL(manifest[platform]);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/banksetu/app/releases/download/v${manifest.latestVersion}/`)) throw Error(`Invalid ${platform}`);
}
console.log(`Portfolio content valid; release ${manifest.latestVersion}`);
