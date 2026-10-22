import { readFileSync } from 'node:fs';
const path = process.argv[2] || 'public/version.json';
const manifest = JSON.parse(readFileSync(path));
const version = manifest.latestVersion;
if (!/^\d+\.\d+\.\d+$/.test(version) || manifest.version !== version || manifest.releaseTag !== `v${version}`) throw Error('Release version mismatch');
const expected = [`BankSetu-Setup-${version}-x64.exe`, `BankSetu-Android-${manifest.androidBuild}.apk`, 'latest.yml'];
for (const [key,name] of [['windowsDownloadUrl',expected[0]],['androidDownloadUrl',expected[1]]]) {
  if (manifest[key] !== `https://github.com/banksetu/app/releases/download/v${version}/${name}`) throw Error(`Invalid ${key}`);
}
if (!process.env.GH_TOKEN) throw Error('GitHub API token unavailable');
const response = await fetch(`https://api.github.com/repos/banksetu/app/releases/tags/v${version}`, {headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
if (!response.ok) throw Error(`Published release v${version} not verified (${response.status})`);
const release = await response.json();
if (release.draft || release.prerelease || !expected.every(name => release.assets?.some(asset => asset.name === name && asset.state === 'uploaded' && asset.size > 0))) throw Error('Published release assets incomplete');
console.log(`Published v${version}: Windows, signed Android build, and Windows feed present.`);
