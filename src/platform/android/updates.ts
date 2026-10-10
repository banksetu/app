import { App } from '@capacitor/app';
import { parsePlatformNotes } from '../releaseNotes';

const RELEASES = 'https://api.github.com/repos/banksetu/app/releases?per_page=30';

type AndroidRelease = {
  draft: boolean;
  prerelease: boolean;
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets: Array<{ name: string; browser_download_url: string }>;
};

export async function checkAndroidUpdate() {
  const current = await App.getInfo();
  const currentBuild = Number.parseInt(String(current.build || '0'), 10) || 0;
  const currentVersion = String(current.version || '').trim();

  const response = await fetch(RELEASES, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Android release information is unavailable.');

  const releases = await response.json() as AndroidRelease[];
  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .flatMap((release) => release.assets.flatMap((asset) => {
      const match = /^BankSetu-Android-(\d+)\.apk$/.exec(asset.name);
      if (!match) return [];

      const url = new URL(asset.browser_download_url);
      if (
        url.origin !== 'https://github.com' ||
        !url.pathname.startsWith('/banksetu/app/releases/download/')
      ) return [];

      const version = String(release.tag_name || '').replace(/^v/, '').trim();
      return [{
        build: Number(match[1]),
        version: version || `Android build ${match[1]}`,
        downloadUrl: url.href,
        notes: /^## (Windows|Android)\s*$/im.test(release.body || '') ? '' : release.body || '',
        changelog: parsePlatformNotes(release.body || '', 'Android'),
        releaseDate: release.published_at?.slice(0,10),
      }];
    }))
    .sort((a, b) => b.build - a.build);

  const latest = candidates[0];

  return {
    available: Boolean(latest && latest.build > currentBuild),
    currentVersion,
    currentBuild,
    latestVersion: latest?.version || currentVersion || 'Unknown',
    latestBuild: latest?.build || currentBuild,
    downloadUrl: latest?.downloadUrl || '',
    notes: latest?.notes || '',
    changelog: latest?.changelog,
    releaseDate: latest?.releaseDate,
  };
}
