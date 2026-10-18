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
    await page.waitForTimeout(350); // Existing card entrance animation must finish before sampling paint.
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
  for (const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.setContent(`<main class="banksetu-app-shell" data-appearance="dark"><section class="banksetu-main-workspace"><header class="persistent-bank-header" style="background:#fff"><div class="bank-logo-zone"><img alt="Bank logo" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9S3CqVEAAAAASUVORK5CYII=" /></div><div class="bank-info-strip"><h2>Bank name</h2><span>Branch details</span></div></header><section class="all-customer-data" style="background:#fff"><h2>All Customer Data</h2><table><thead><tr><th style="background:#f9e8ee">Customer ID</th></tr></thead><tbody><tr style="background:#fff"><td>Sample</td></tr></tbody></table></section><section class="license-panel"><div class="license-summary"><button class="license-tile"><div><strong>1</strong><small>Active clients</small></div></button></div><nav class="license-tabs"><button>All Clients</button></nav><div class="license-request-board"><div class="license-history-scroll"><table class="license-history license-client-table"><thead><tr>${Array.from({length:9},(_,i)=>`<th>Column ${i}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({length:9},(_,i)=>`<td>${i===2?'Synthetic Client':'Value'}</td>`).join('')}</tr></tbody></table></div></div></section></section></main>`);
    await page.addStyleTag({content:'.pdf-detail,.pdf-mode:has(input:checked),.print-alignment-window,.print-alignment-settings,.print-alignment-panel{background:#fff;color:#15283a}.pdf-dialog p{color:#64748b}.print-alignment-frame{background:#fff}'});
    await page.addStyleTag({path:'src/LicenseManagement.css'});
    await page.addStyleTag({path:'src/App.css'});
    await page.locator('.banksetu-main-workspace').evaluate(el=>el.insertAdjacentHTML('beforeend','<section class="pdf-dialog"><label class="pdf-mode"><input type="radio" checked><strong>Account Number Range</strong></label><div class="pdf-detail"><p>Selected local customers</p></div></section>'));
    await page.locator('body').evaluate(el=>el.insertAdjacentHTML('beforeend','<div class="print-alignment-overlay"><div class="print-alignment-window"><div class="print-alignment-settings"><div class="print-alignment-panel"><h3>Move Layout</h3><div class="print-alignment-saved"><strong>Current saved setting</strong></div><div class="print-alignment-frame">Paper preview</div></div></div></div></div>'));
    await page.waitForTimeout(350); // Let existing button and section entrance transitions settle before checking colors.
    const surfaces=await page.evaluate(()=>({header:getComputedStyle(document.querySelector('.persistent-bank-header')).backgroundColor,
      info:getComputedStyle(document.querySelector('.bank-info-strip span')).color,
      customer:getComputedStyle(document.querySelector('.all-customer-data')).backgroundColor,
      heading:getComputedStyle(document.querySelector('.all-customer-data th')).backgroundColor,
      row:getComputedStyle(document.querySelector('.all-customer-data tbody tr')).backgroundColor,
      tile:getComputedStyle(document.querySelector('.license-tile')).backgroundColor,
      license:getComputedStyle(document.querySelector('.license-client-table td')).backgroundColor,
      pdf:getComputedStyle(document.querySelector('.pdf-detail')).backgroundColor,
      selected:getComputedStyle(document.querySelector('.pdf-mode:has(input:checked)')).backgroundColor,
      alignment:getComputedStyle(document.querySelector('.print-alignment-settings')).backgroundColor,
      paper:getComputedStyle(document.querySelector('.print-alignment-frame')).backgroundColor,
      layout:getComputedStyle(document.querySelector('.license-client-table tr')).display,
      overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert.equal(surfaces.header,'rgb(23, 35, 56)');assert.equal(surfaces.customer,'rgb(23, 35, 56)');
    assert.equal(surfaces.heading,'rgb(35, 50, 73)');assert.equal(surfaces.row,'rgb(23, 35, 56)');
    assert.equal(surfaces.tile,'rgb(23, 35, 56)');assert.equal(surfaces.license,'rgb(23, 35, 56)');
    assert.equal(surfaces.info,'rgb(203, 213, 225)');assert.equal(surfaces.layout,width===390?'grid':'table-row');
    assert.equal(surfaces.pdf,'rgb(35, 50, 73)');assert.equal(surfaces.selected,'rgb(41, 65, 102)');
    assert.equal(surfaces.alignment,'rgb(23, 35, 56)');assert.equal(surfaces.paper,'rgb(255, 255, 255)');
    assert(!surfaces.overflow,JSON.stringify(surfaces));await page.close();
  }
} finally { await browser.close(); }
console.log('Sidebar bottom, light gradients, dark cards, mobile overflow and section order passed.');
