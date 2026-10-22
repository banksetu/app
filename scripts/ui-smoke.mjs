import assert from 'node:assert/strict';
import { chromium, _electron } from 'playwright';
const desktop=process.argv.includes('--desktop');
let browser,app;
try {
 let page;
 if(desktop){app=await _electron.launch({args:['.','--user-data-dir='+process.env.RUNNER_TEMP+'/BankSetuSmoke']});page=await app.firstWindow();}
 else {browser=await chromium.launch();page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:4173');}
 await page.locator('input[type=email]').waitFor({timeout:30000});
 assert.equal(await page.locator('input[type=password]').count(),1);
 await page.getByRole('button',{name:/^Sign In/}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Login must fit the viewport');
 if(desktop){assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>typeof window.bankSetuDesktop),'object');}
 console.log(desktop?'Windows Electron login and preload smoke passed':'Mobile browser login smoke passed');
}finally{await app?.close();await browser?.close();}
