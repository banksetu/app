const {test}=require('node:test');
const assert=require('node:assert/strict');
const {installPreviewShare}=require('./share-preview.cjs');

test('Windows share saves the exact PNG bytes and handles cancel and invalid images',async()=>{
  let handler, written, opened, canceled=false;
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  installPreviewShare({
    ipcMain:{handle:(_name,fn)=>{handler=fn;}},trusted:()=>{},window:{},
    dialog:{showSaveDialog:async()=>canceled?{canceled:true}:{filePath:'preview.png'}},
    fs:{promises:{writeFile:async(path,bytes)=>{written={path,bytes};}}},
    shell:{showItemInFolder:path=>{opened=path;}},
  });
  const image=`data:image/png;base64,${png.toString('base64')}`;
  assert.deepEqual(await handler({},image),{saved:true});
  assert.equal(written.path,'preview.png');
  assert.deepEqual(written.bytes,png);
  assert.equal(opened,'preview.png');
  canceled=true;written=undefined;
  assert.deepEqual(await handler({},image),{saved:false,canceled:true});
  assert.equal(written,undefined);
  await assert.rejects(handler({},'data:image/png;base64,ZmFrZQ=='),/invalid/i);
});
