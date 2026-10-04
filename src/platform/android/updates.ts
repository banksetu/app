import { App } from '@capacitor/app';

const RELEASES = 'https://api.github.com/repos/banksetu/app/releases?per_page=30';
export async function checkAndroidUpdate() {
  const current = await App.getInfo();
  const response = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Android release information is unavailable.');
  const releases = await response.json() as Array<{draft:boolean; prerelease:boolean; body?:string; assets:Array<{name:string; browser_download_url:string}>}>;
  const candidates = releases.filter(r => !r.draft && !r.prerelease).flatMap(r => r.assets.flatMap(a => {
    const match = /^BankSetu-Android-(\d+)\.apk$/.exec(a.name);
    if (!match) return [];
    const url = new URL(a.browser_download_url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/banksetu/app/releases/download/')) return [];
    return [{build:Number(match[1]), downloadUrl:url.href, notes:r.body || ''}];
  })).sort((a,b) => b.build-a.build);
  const latest = candidates[0];
  return {available:!!latest && latest.build > Number(current.build), latestVersion:latest ? `Android build ${latest.build}` : current.version, downloadUrl:latest?.downloadUrl || '', notes:latest?.notes || ''};
}
