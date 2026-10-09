import content from '../content/site.json';
import './style.css';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
const root = document.querySelector<HTMLDivElement>('#app')!;
document.documentElement.style.setProperty('--primary', content.theme.primary);
document.documentElement.style.setProperty('--deep', content.theme.deep);
document.documentElement.style.setProperty('--accent', content.theme.accent);

const featureMarkup = content.features.map((item, index) => `<article class="feature-card"><span class="feature-icon icon-${index % 6}" aria-hidden="true">${escapeHtml(item.icon)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('');
const screenshotMarkup = content.screenshots.map((item, index) => `<article class="screen-card"><button class="screen-open" type="button" data-screen="${index}" aria-label="View ${escapeHtml(item.title)} screenshot"><div class="screen-frame"><img loading="lazy" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}"></div></button><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p>${index === 0 ? '<small>Identity details edited for privacy</small>' : ''}</article>`).join('');

root.innerHTML = `
<header class="site-header"><div class="nav-shell"><a class="brand" href="#home" aria-label="Bank Setu home"><img src="/icon-192.png" alt="" width="42" height="42"><span>Bank <em>Setu</em></span></a><nav class="nav-links" aria-label="Main navigation"><a href="#home">Home</a><a href="#features">Features</a><a href="#screenshots">Screenshots</a><a href="#download">Download</a><a href="#about">About</a></nav><a class="top-download" href="#download"><span aria-hidden="true">↓</span> Get Bank Setu</a></div></header>
<main>
<section class="hero" id="home"><div class="hero-inner"><div class="hero-copy"><span class="eyebrow">${escapeHtml(content.banner)}</span><h1>Bank <span>Setu</span></h1><h2>${escapeHtml(content.hero)}</h2><p>${escapeHtml(content.description)}</p><div class="hero-actions"><a id="hero-win" class="download-button windows" href="#download"><span class="platform-symbol" aria-hidden="true">▦</span><span><strong>Download for Windows</strong><small class="release-version">Latest verified release</small></span><span class="button-arrow" aria-hidden="true">↗</span></a><a id="hero-android" class="download-button android" href="#download"><span class="platform-symbol" aria-hidden="true">♟</span><span><strong>Download for Android</strong><small class="release-version">Latest verified release</small></span><span class="button-arrow" aria-hidden="true">↗</span></a></div><div class="hero-checks"><span>✓ Local-first work</span><span>✓ Authorized access</span><span>✓ App updates</span></div></div><div class="hero-visual"><div class="visual-halo"></div><div class="laptop" aria-label="Illustrative Bank Setu workspace preview"><div class="laptop-screen"><div class="laptop-bar"><span class="laptop-logo"><img src="/icon-192.png" alt=""> Bank Setu</span><span class="laptop-dots">● ● ●</span></div><div class="laptop-body"><div class="laptop-sidebar"><b>▣ Dashboard</b><span>◉ Customers</span><span>▤ Passbook</span><span>↔ Sync &amp; Backup</span></div><div class="laptop-content"><span class="preview-label">ILLUSTRATIVE WORKSPACE</span><h3>Work at a glance</h3><div class="preview-tiles"><span>Customers</span><span>Passbook</span><span>Sync</span></div><div class="preview-lines"><i></i><i></i><i></i></div></div></div></div><div class="laptop-base"></div></div><div class="phone-hero"><img src="/screenshots/dashboard-privacy.png" alt="Bank Setu mobile dashboard with private identity details removed"></div><span class="visual-note">Real mobile screenshot · private details removed</span></div></div><div class="hero-wave" aria-hidden="true"></div></section>
<section class="quick-strip" aria-label="Product capabilities"><div><span>◉</span><b>Customer<br>Management</b></div><div><span>▤</span><b>Passbook<br>Printing</b></div><div><span>✓</span><b>KYC &amp;<br>Status</b></div><div><span>▧</span><b>Documents<br>&amp; Photos</b></div><div><span>↔</span><b>Local-first<br>Sync</b></div><div><span>◈</span><b>Backup &amp;<br>Restore</b></div></section>
<section id="features" class="section"><div class="section-heading"><span class="section-kicker">POWERFUL FEATURES</span><h2>Everything you need for a clearer workflow</h2><p>Practical tools already available in the Bank Setu Windows and Android applications.</p></div><div class="feature-grid">${featureMarkup}</div></section>
<section id="screenshots" class="section screenshot-section"><div class="section-heading"><span class="section-kicker">APP SCREENS</span><h2>See Bank Setu in action</h2><p>Actual Android app screens. Personal identity information has been removed from the dashboard preview.</p></div><div class="screens-wrap"><button class="carousel-arrow" id="screens-prev" type="button" aria-label="Previous screenshots">‹</button><div class="screens-track" id="screens-track">${screenshotMarkup}</div><button class="carousel-arrow" id="screens-next" type="button" aria-label="Next screenshots">›</button></div></section>
<section class="section steps-section"><div class="section-heading"><span class="section-kicker">GET STARTED</span><h2>How Bank Setu works</h2><p>Install the app and use your authorized workspace.</p></div><div class="steps"><article><span>↓</span><b>1</b><h3>Download</h3><p>Choose the Windows or Android release.</p></article><article><span>⚙</span><b>2</b><h3>Install</h3><p>Install the application on your device.</p></article><article><span>●</span><b>3</b><h3>Sign in</h3><p>Use an authorized Bank Setu account in the app.</p></article><article><span>↗</span><b>4</b><h3>Manage</h3><p>Work with customer records and sync tools.</p></article></div></section>
<section id="download" class="section download-section"><div class="download-copy"><span class="section-kicker">LATEST RELEASE</span><h2>Download Bank Setu</h2><p>${escapeHtml(content.downloadText)}</p><p id="release-status" role="status">Checking published release…</p><div class="download-actions"><a class="download-button windows disabled" id="win-link" aria-disabled="true"><span class="platform-symbol" aria-hidden="true">▦</span><span><strong>Windows EXE</strong><small>Checking release</small></span><span class="button-arrow" aria-hidden="true">↓</span></a><a class="download-button android disabled" id="android-link" aria-disabled="true"><span class="platform-symbol" aria-hidden="true">♟</span><span><strong>Android APK</strong><small>Checking release</small></span><span class="button-arrow" aria-hidden="true">↓</span></a></div><a id="release-notes" class="release-notes" hidden target="_blank" rel="noopener noreferrer">↗ View release notes</a></div><aside class="download-guide"><h3>Installation at a glance</h3><p><strong>Windows:</strong> Download the EXE and follow its setup instructions.</p><p><strong>Android:</strong> Download the signed APK and follow the Android installer prompts.</p><p><strong>Account:</strong> An authorized Bank Setu sign-in is required inside the app.</p><p class="guide-note">Internet access is needed for cloud synchronization.</p></aside></section>
<section id="about" class="section about-section"><div><span class="section-kicker">ABOUT BANK SETU</span><h2>Built around everyday customer work</h2><p>${escapeHtml(content.footer)}</p></div><div class="about-art" aria-hidden="true"><span>Bank Setu</span><i></i><b>LOCAL · CONNECTED · ORGANIZED</b></div></section>
</main><footer class="footer"><div class="footer-brand"><img src="/icon-192.png" alt="" width="38" height="38"><div><strong>Bank Setu</strong><small>Customer workflow software</small></div></div><div class="footer-links"><a href="#home">Home</a><a href="#features">Features</a><a href="#screenshots">Screenshots</a><a href="#download">Download</a><a href="#about">About</a></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Bank Setu</span><span><a href="/privacy-policy/">Privacy Policy</a> · <a href="/terms/">Terms</a></span></div></footer>
<dialog id="screen-dialog" class="screen-dialog" aria-label="Screenshot preview"><button class="dialog-close" type="button" aria-label="Close preview">×</button><img alt=""><p></p></dialog>`;

type Manifest = {latestVersion:string;releaseDate?:string;windowsDownloadUrl:string;androidDownloadUrl:string;releaseUrl:string};
function verifiedUrl(url: string, version: string, extension: string): string | null {
  try { const parsed = new URL(url); return parsed.origin === 'https://github.com' && parsed.pathname.startsWith(`/banksetu/app/releases/download/v${version}/`) && parsed.pathname.endsWith(extension) ? parsed.href : null; } catch { return null; }
}
async function showRelease() {
  const status = document.querySelector<HTMLElement>('#release-status')!;
  try {
    const response = await fetch('/version.json', {cache:'no-store',signal:AbortSignal.timeout(9000)});
    if (!response.ok) throw Error('Manifest unavailable');
    const manifest = await response.json() as Manifest;
    if (!/^\d+\.\d+\.\d+$/.test(manifest.latestVersion)) throw Error('Invalid version');
    const win = verifiedUrl(manifest.windowsDownloadUrl,manifest.latestVersion,'.exe');
    const android = verifiedUrl(manifest.androidDownloadUrl,manifest.latestVersion,'.apk');
    if (!win || !android) throw Error('Invalid release URLs');
    status.textContent = `Latest verified version: v${manifest.latestVersion}${/^\d{4}-\d{2}-\d{2}$/.test(manifest.releaseDate || '') ? ` · ${manifest.releaseDate}` : ''}`;
    for (const [id,url] of [['win-link',win],['android-link',android],['hero-win',win],['hero-android',android]]) {
      const link = document.querySelector<HTMLAnchorElement>(`#${id}`)!;
      link.href=url; link.rel='noopener noreferrer'; link.removeAttribute('aria-disabled'); link.classList.remove('disabled');
      const small=link.querySelector('small'); if(small) small.textContent=`Version ${manifest.latestVersion}`;
    }
    const notes = document.querySelector<HTMLAnchorElement>('#release-notes')!;
    const release = new URL(manifest.releaseUrl);
    if (release.origin === 'https://github.com' && release.pathname === `/banksetu/app/releases/tag/v${manifest.latestVersion}`) { notes.href=release.href;notes.hidden=false; }
  } catch { status.textContent='Download information is temporarily unavailable. Please try again later.'; }
}
void showRelease();

const track=document.querySelector<HTMLElement>('#screens-track')!;
document.querySelector('#screens-prev')!.addEventListener('click',()=>track.scrollBy({left:-track.clientWidth*.8,behavior:'smooth'}));
document.querySelector('#screens-next')!.addEventListener('click',()=>track.scrollBy({left:track.clientWidth*.8,behavior:'smooth'}));
const dialog=document.querySelector<HTMLDialogElement>('#screen-dialog')!;
document.querySelectorAll<HTMLButtonElement>('.screen-open').forEach(button=>button.addEventListener('click',()=>{
  const item=content.screenshots[Number(button.dataset.screen)]; if(!item)return;
  const img=dialog.querySelector('img')!;img.src=item.src;img.alt=item.alt;
  dialog.querySelector('p')!.textContent=item.title;
  dialog.showModal();
}));
dialog.querySelector('button')!.addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
