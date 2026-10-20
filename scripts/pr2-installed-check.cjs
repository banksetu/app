const assert=require('node:assert/strict'),path=require('node:path');
const {nativeClient}=require('../desktop/pr2-native.cjs');
(async()=>{const directory=path.resolve(process.argv[2]||'desktop-release/win-unpacked/resources/pr2');const client=nativeClient(directory);try{await client.handshake();const found=await client.list();assert.ok(Array.isArray(found.devices));assert.ok(Array.isArray(found.queues));console.log('Installed Bridge checksum, protocol and Windows discovery passed (no printer job sent).');}finally{client.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
