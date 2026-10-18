import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    await page.setContent(`<main class="banksetu-app-shell" data-appearance="light"><aside class="banksetu-sidebar open"><div>Bank Setu</div><nav>${Array.from({length:18},(_,i)=>`<button class="banksetu-nav-item">Menu ${i}</button>`).join('')}</nav><div class="banksetu-appearance"><button class="selected" aria-pressed="true">☀ Light</button><button aria-pressed="false">☾ Dark</button></div></aside><section class="banksetu-main-workspace"><section class="dashboard-stats-grid">${Array.from({length:4},(_,i)=>`<button class="dashboard-stat-card">Overview ${i}</button>`).join('')}</section><section class="dashboard-quick-panel"><h2>Quick Actions</h2><div class="dashboard-quick-grid">${Array.from({length:4},(_,i)=>`<button class="dashboard-quick-card">Action ${i}</button>`).join('')}</div></section><section class="dashboard-analytics"><h2>Analytics</h2><div class="dashboard-analytics-grid">${Array.from({length:3},(_,i)=>`<article class="dashboard-analytics-card">Chart ${i}</article>`).join('')}</div></section></section></main>`);
    await page.addStyleTag({path:'src/App.css'});
    const light = await page.evaluate(() => ({sidebar:getComputedStyle(document.querySelector('.banksetu-sidebar')).backgroundImage,overview:getComputedStyle(document.querySelector('.dashboard-stat-card')).backgroundImage}));
    assert(light.sidebar.includes('gradient'),'Light Mode keeps Master menu gradient');
    assert(light.overview.includes('gradient'),'Light Mode keeps overview gradient');
    await page.locator('.banksetu-app-shell').evaluate(el=>el.dataset.appearance='dark');
    const dark = await page.evaluate(() => {
      const sidebar=document.querySelector('.banksetu-sidebar'),toggle=document.querySelector('.banksetu-appearance'),nav=sidebar.querySelector('nav');
      const toggleRect=toggle.getBoundingClientRect(),sideRect=sidebar.getBoundingClientRect();
      return {side:getComputedStyle(sidebar).backgroundColor,card:getComputedStyle(document.querySelector('.dashboard-stat-card')).backgroundColor,
        quick:getComputedStyle(document.querySelector('.dashboard-quick-card')).backgroundColor,
        bottom:Math.round(sideRect.bottom-toggleRect.bottom),center:Math.abs((sideRect.left+sideRect.right-toggleRect.left-toggleRect.right)/2),
        navScroll:nav.scrollHeight>nav.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
        order:[...document.querySelectorAll('.banksetu-main-workspace>section')].map(el=>el.className)};
    });
    assert.equal(dark.side,'rgb(17, 28, 48)');assert.equal(dark.card,'rgb(23, 35, 56)');assert.equal(dark.quick,'rgb(35, 50, 73)');
    assert(dark.bottom>=0 && dark.bottom<=4,JSON.stringify(dark));assert(dark.center<2,JSON.stringify(dark));
    assert(dark.navScroll);assert(!dark.overflow);assert.deepEqual(dark.order,['dashboard-stats-grid','dashboard-quick-panel','dashboard-analytics']);
    await page.close();
  }
} finally { await browser.close(); }
console.log('Sidebar bottom, light gradients, dark cards, mobile overflow and section order passed.');
