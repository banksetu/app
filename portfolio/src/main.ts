import content from '../content/site.json';
import './style.css';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
const root = document.querySelector<HTMLDivElement>('#app')!;
document.documentElement.style.setProperty('--primary', content.theme.primary);
document.documentElement.style.setProperty('--deep', content.theme.deep);
document.documentElement.style.setProperty('--accent', content.theme.accent);
const features = content.features.map(item => `<article class="card"><span class="feature-icon" aria-hidden="true">${escapeHtml(item.icon)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('');
const screenshots = content.screenshots.length ? content.screenshots.map(item => `<figure><img loading="lazy" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}"><figcaption>${escapeHtml(item.alt)}</figcaption></figure>`).join('') : `<div class="mock" role="img" aria-label="Bank Setu इंटरफ़ेस का सांकेतिक चित्र"><div class="mock-top">Bank Setu · सांकेतिक प्रीव्यू</div><div class="mock-grid"><div><b>ग्राहक प्रबंधन</b><span>रिकॉर्ड और स्थिति</span></div><div><b>Local-first</b><span>डिवाइस पर काम</span></div><div><b>Sync</b><span>Google Sheets / Drive</span></div></div><small>यह वास्तविक ग्राहक स्क्रीनशॉट नहीं है।</small></div>`;
root.innerHTML = `<header class="header"><a class="brand" href="#home"><img src="/icon-192.png" alt="" width="38" height="38"><span>${escapeHtml(content.title)}</span></a><nav aria-label="मुख्य नेविगेशन"><a href="#home">Home</a><a href="#features">Features</a><a href="#screenshots">Screenshots</a><a href="#download">Download</a><a href="#about">About</a></nav></header><main><section class="hero" id="home"><div><span class="pill">${escapeHtml(content.banner)}</span><h1>${escapeHtml(content.hero)}</h1><p>${escapeHtml(content.description)}</p><div class="actions"><a class="button" id="hero-win" href="#download">Windows डाउनलोड</a><a class="button secondary" id="hero-android" href="#download">Android डाउनलोड</a></div><span class="hint">इंस्टॉल के बाद अधिकृत Bank Setu account से sign in करें।</span></div><div class="hero-art" aria-hidden="true"><div class="art-window"><div class="dots">● ● ●</div><div class="art-title">BANK SETU</div><div class="art-row"><span>Customer records</span><strong>◎</strong></div><div class="art-row"><span>Local workspace</span><strong>↔</strong></div><div class="art-row"><span>Backup &amp; sync</span><strong>✓</strong></div></div></div></section><section id="features" class="section"><div class="section-head"><span>काम की सुविधाएँ</span><h2>रोज़ के काम के लिए एक व्यवस्थित workspace</h2></div><div class="cards">${features}</div></section><section id="screenshots" class="section pale"><div class="section-head"><span>प्रीव्यू</span><h2>Bank Setu की एक झलक</h2></div>${screenshots}</section><section class="section"><div class="section-head"><span>कैसे शुरू करें</span><h2>चार आसान कदम</h2></div><div class="steps"><div><b>01</b><p>अपना Windows या Android ऐप डाउनलोड करें।</p></div><div><b>02</b><p>डिवाइस पर ऐप इंस्टॉल करें।</p></div><div><b>03</b><p>अधिकृत Bank Setu account से sign in करें।</p></div><div><b>04</b><p>ग्राहक रिकॉर्ड और sync सुविधाएँ उपयोग करें।</p></div></div></section><section id="download" class="section download"><div class="section-head"><span>डाउनलोड</span><h2>अपने डिवाइस पर Bank Setu</h2><p>${escapeHtml(content.downloadText)}</p></div><p id="release-status" role="status">सत्यापित रिलीज़ की जानकारी लोड हो रही है…</p><div class="download-grid"><article class="download-card"><h3>Windows EXE</h3><p>Windows installer डाउनलोड करें। Setup चलाकर ऐप इंस्टॉल करें।</p><a class="button disabled" id="win-link" aria-disabled="true">रिलीज़ जाँची जा रही है</a></article><article class="download-card"><h3>Android APK</h3><p>डाउनलोड के बाद Android के installer निर्देशों का पालन करें।</p><a class="button disabled" id="android-link" aria-disabled="true">रिलीज़ जाँची जा रही है</a></article></div><a id="release-notes" class="notes" hidden rel="noopener noreferrer" target="_blank">Release notes देखें</a></section><section id="about" class="section about"><div><span>About</span><h2>Bank Setu</h2><p>${escapeHtml(content.footer)}</p></div><p>ऐप का उपयोग केवल अधिकृत खातों से होता है। यह public page किसी ग्राहक रिकॉर्ड तक पहुँच नहीं देता।</p></section></main><footer><span>© ${new Date().getFullYear()} Bank Setu</span><span><a href="/privacy-policy/">Privacy Policy</a> · <a href="/terms/">Terms</a> · <a href="#home">ऊपर जाएँ ↑</a></span></footer>`;

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
    status.textContent = `नवीनतम सत्यापित रिलीज़: v${manifest.latestVersion}${/^\d{4}-\d{2}-\d{2}$/.test(manifest.releaseDate || '') ? ` · ${manifest.releaseDate}` : ''}`;
    for (const [id,url] of [['win-link',win],['android-link',android],['hero-win',win],['hero-android',android]]) { const link = document.querySelector<HTMLAnchorElement>(`#${id}`)!; link.href=url; link.rel='noopener noreferrer'; link.removeAttribute('aria-disabled'); link.classList.remove('disabled'); if (id.endsWith('link')) link.textContent=id==='win-link'?'Windows EXE डाउनलोड':'Android APK डाउनलोड'; }
    const notes = document.querySelector<HTMLAnchorElement>('#release-notes')!;
    const release = new URL(manifest.releaseUrl);
    if (release.origin === 'https://github.com' && release.pathname === `/banksetu/app/releases/tag/v${manifest.latestVersion}`) { notes.href=release.href;notes.hidden=false; }
  } catch { status.textContent='डाउनलोड जानकारी अभी उपलब्ध नहीं है। कृपया बाद में फिर देखें।'; }
}
void showRelease();
