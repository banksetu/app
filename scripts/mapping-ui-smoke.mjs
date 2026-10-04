import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const harness='mapping-smoke.html', modulePath='src/mapping-smoke.tsx';
fs.writeFileSync(harness,'<div id="root"></div><script type="module" src="/src/mapping-smoke.tsx"></script>');
fs.writeFileSync(modulePath,`import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './BankFormatLayoutEditor';
const mode=new URLSearchParams(location.search).get('mode')==='print'?'print':'extraction';
createRoot(document.getElementById('root')!).render(<Editor mode={mode} sampleUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='800'%3E%3Crect width='600' height='800' fill='white'/%3E%3C/svg%3E" mimeType="image/svg+xml" initialMap={[]} initialWidth={210} initialHeight={297} onSave={async map=>{window.saved=map;}} onClose={()=>{}} />);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:5198');break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
 browser=await chromium.launch();
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:900},hasTouch:mobile,isMobile:mobile});
  await page.goto('http://127.0.0.1:5198/mapping-smoke.html');
  const surface=page.locator('div[style*="crosshair"]');await surface.waitFor();const box=await surface.boundingBox();
  if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.1,y:box.y+box.height*.1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.4,y:box.y+box.height*.2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.2,{steps:5});await page.mouse.up();}
  await page.getByRole('button',{name:'Save reading sections'}).click();
  const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert(saved[0].width>29);assert(saved[0].height>9);
  console.log((mobile?'Touch/mobile':'Desktop')+' reading rectangle/save passed');
  await page.goto('http://127.0.0.1:5198/mapping-smoke.html?mode=print');await surface.waitFor();await surface.click({position:{x:60,y:60}});await page.getByRole('button',{name:'Save print layout'}).click();assert.equal((await page.evaluate(()=>window.saved)).length,1);console.log('Print placement/save passed');await page.close();
 }
}finally{await browser?.close();server.kill();fs.rmSync(harness,{force:true});fs.rmSync(modulePath,{force:true});}
