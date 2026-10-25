const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAppPreferences}=require('./app-preferences.cjs');
const {installAppMenu}=require('./app-menu.cjs');

test('Windows printer and unique custom shortcuts persist locally',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-menu-')),file=path.join(directory,'preferences.json');
  try{
    const first=createAppPreferences(file);first.setDefaultPrinter('Epson PLQ-20');first.setShortcut('dashboard','F4');
    const saved=createAppPreferences(file).get();
    assert.equal(saved.defaultPrinter,'Epson PLQ-20');assert.equal(saved.shortcuts.dashboard,'F4');assert.equal(saved.shortcuts.passbook,'F1');
    first.resetShortcuts();assert.equal(first.get().shortcuts.dashboard,'F1');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('native shortcut menu disables protected pages in read-only mode and uses app printer preference',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-native-menu-'));let template,licensed=false,warnings=0;
  const sent=[];const target={isDestroyed:()=>false,webContents:{send:(...args)=>sent.push(args),getPrintersAsync:async()=>[{name:'Windows printer',isDefault:true},{name:'Passbook printer'}]}};
  const Menu={buildFromTemplate:value=>value,setApplicationMenu:value=>{template=value;}};
  try{
    const installed=installAppMenu({app:{},Menu,dialog:{showMessageBox:async()=>{warnings++;}},getWindow:()=>target,authorize:()=>{if(!licensed)throw Error('read only');},userData:directory});
    let shortcuts=template.find(item=>item.label==='Shortcuts').submenu;
    assert.equal(shortcuts.find(item=>item.label==='Customer Entry').enabled,false);
    assert.equal(shortcuts.find(item=>item.label==='Dashboard').enabled,true);
    licensed=true;installed.refreshState();shortcuts=template.find(item=>item.label==='Shortcuts').submenu;
    shortcuts.find(item=>item.label==='Customer Entry').click();assert.deepEqual(sent.at(-1),['app-menu:navigate','customer-entry']);
    await installed.refreshPrinters();
    let printers=template.find(item=>item.label==='Default Printer').submenu;
    printers.find(item=>item.label==='Passbook printer').click();assert.equal(installed.getDefaultPrinter(),'Passbook printer');
    licensed=false;installed.refreshState();shortcuts=template.find(item=>item.label==='Shortcuts').submenu;
    assert.equal(shortcuts.find(item=>item.label==='Passbook Print').enabled,false);assert.equal(warnings,0);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
