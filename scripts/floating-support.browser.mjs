import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
fs.writeFileSync('test-evidence/floating-support.html','<div id="root"></div><script type="module" src="/test-evidence/floating-support.tsx"></script>');
fs.writeFileSync('test-evidence/floating-support.tsx',`import React from'react';import{createRoot}from'react-dom/client';import FloatingSupportButton from'../src/FloatingSupportButton';import'../src/App.css';localStorage.setItem('bankSetuSupportPositionV2','{"x":20,"y":20}');createRoot(document.getElementById('root')).render(<main><input aria-label="Keyboard field"/><FloatingSupportButton unread={0} open={()=>{}}/></main>);`);
const server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{host:'127.0.0.1',port:5202,strictPort:true}});
let browser;
const rect=page=>page.getByRole('button',{name:'Open Support Center',exact:true}).evaluate(element=>{const box=element.getBoundingClientRect();return{x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:box.width,height:box.height};});
const drag=async(page,x,y)=>{const before=await rect(page);await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:8});await page.mouse.up();};
try{
 await server.listen();
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const desktop=await browser.newPage({viewport:{width:1280,height:800}});await desktop.goto('http://127.0.0.1:5202/test-evidence/floating-support.html');
 await desktop.waitForFunction(()=>localStorage.getItem('bankSetuSupportPositionV2')===null);
 let home=await rect(desktop);assert(Math.abs(home.right-1268)<2&&Math.abs(home.bottom-788)<2,'desktop starts in the bottom-right corner');
 await drag(desktop,90,180);let moved=await rect(desktop);assert(moved.x<150&&moved.y<240,'desktop support icon remains temporarily draggable');
 await desktop.waitForTimeout(5500);home=await rect(desktop);assert(Math.abs(home.right-1268)<2&&Math.abs(home.bottom-788)<2,`desktop returns home after five seconds: ${JSON.stringify(home)}`);
 await drag(desktop,160,220);await desktop.setViewportSize({width:1000,height:650});await desktop.waitForTimeout(100);home=await rect(desktop);assert(Math.abs(home.right-988)<2&&Math.abs(home.bottom-638)<2,'window resize immediately restores the bottom-right corner');
 await desktop.getByLabel('Keyboard field').focus();const desktopKeyboardHome=await rect(desktop);await desktop.setViewportSize({width:1000,height:400});await desktop.waitForTimeout(100);let keyboard=await rect(desktop);assert(Math.abs(keyboard.y-desktopKeyboardHome.y)<2,'opening a Windows on-screen keyboard does not push the support icon upward');await desktop.setViewportSize({width:1000,height:650});await desktop.getByLabel('Keyboard field').blur();
 await desktop.close();

 const mobile=await browser.newPage({viewport:{width:390,height:800}});await mobile.goto('http://127.0.0.1:5202/test-evidence/floating-support.html');await mobile.waitForTimeout(100);
 const mobileHome=await rect(mobile);assert(Math.abs(mobileHome.right-388)<2&&Math.abs(mobileHome.bottom-798)<2,'mobile starts two pixels inside the bottom-right corner');
 await mobile.getByLabel('Keyboard field').focus();await mobile.setViewportSize({width:390,height:500});await mobile.waitForTimeout(100);
 keyboard=await rect(mobile);assert(Math.abs(keyboard.y-mobileHome.y)<2,'opening a mobile keyboard does not push the support icon upward');
 await mobile.setViewportSize({width:390,height:800});await mobile.waitForTimeout(100);home=await rect(mobile);assert(Math.abs(home.right-388)<2&&Math.abs(home.bottom-798)<2,'closing the keyboard restores the same home position');
 await mobile.getByLabel('Keyboard field').blur();await mobile.setViewportSize({width:390,height:650});await mobile.waitForTimeout(100);home=await rect(mobile);assert(Math.abs(home.right-388)<2&&Math.abs(home.bottom-648)<2,'ordinary mobile resize locks two pixels inside the new bottom-right corner');
 await mobile.close();
}finally{
 await browser?.close();await server.close();
 for(const file of ['test-evidence/floating-support.html','test-evidence/floating-support.tsx'])fs.rmSync(file,{force:true});
}
