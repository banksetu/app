import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { download } from '@electron/get';

if (process.platform !== 'win32') throw new Error('Windows Electron preparation must run on a Windows runner.');

const packageJson = JSON.parse(await readFile(new URL('../node_modules/electron/package.json', import.meta.url), 'utf8'));
const version = String(packageJson.version);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Electron package version.');

const fileName = `electron-v${version}-win32-x64.zip`;
const checksumUrl = `https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`;
const mirror = 'https://npmmirror.com/mirrors/electron/';
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function officialChecksum() {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(checksumUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const line = (await response.text()).split(/\r?\n/).find(value => value.endsWith(` *${fileName}`));
      const checksum = line?.split(/\s+/)[0]?.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(checksum || '')) throw new Error('Electron checksum is missing.');
      return checksum;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await delay(attempt * 5000);
    }
  }
  throw new Error(`Could not obtain the official Electron checksum: ${lastError?.message || lastError}`);
}

const checksum = await officialChecksum();
const zip = await download(version, {
  platform: 'win32',
  arch: 'x64',
  mirrorOptions: { mirror },
  checksums: { [fileName]: checksum },
  downloadOptions: { signal: AbortSignal.timeout(300000) }
});

const dist = resolve('node_modules/electron/dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
execFileSync('tar.exe', ['-xf', zip, '-C', dist], { stdio: 'inherit' });
if (!existsSync(resolve(dist, 'electron.exe'))) throw new Error('Verified Electron archive did not contain electron.exe.');
await writeFile(resolve('node_modules/electron/path.txt'), 'electron.exe\n');
console.log(`Prepared Electron v${version} win32-x64 from a mirror using the official SHA-256 checksum.`);
