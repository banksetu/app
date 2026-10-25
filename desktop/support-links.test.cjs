const test=require('node:test');
const assert=require('node:assert/strict');
const {WHATSAPP_APP_URL,WHATSAPP_WEB_URL,openWhatsAppSupport,installSupportLinks}=require('./support-links.cjs');

test('WhatsApp support prefers the installed app protocol',async()=>{
  const opened=[];const result=await openWhatsAppSupport({openExternal:async url=>opened.push(url)});
  assert.deepEqual(result,{opened:'app'});assert.deepEqual(opened,[WHATSAPP_APP_URL]);
});

test('WhatsApp support falls back to the default browser',async()=>{
  const opened=[];const result=await openWhatsAppSupport({openExternal:async url=>{opened.push(url);if(url===WHATSAPP_APP_URL)throw Error('no handler');}});
  assert.deepEqual(result,{opened:'browser'});assert.deepEqual(opened,[WHATSAPP_APP_URL,WHATSAPP_WEB_URL]);
});

test('WhatsApp IPC is restricted by the trusted renderer check',async()=>{
  let handler;installSupportLinks({ipcMain:{handle:(name,value)=>{assert.equal(name,'support:whatsapp');handler=value;}},trusted:()=>{throw Error('untrusted');},shell:{openExternal:()=>assert.fail('must not open')}});
  await assert.rejects(()=>handler({}),/untrusted/);
});
