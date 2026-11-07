const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createTrustedClock}=require('./trusted-clock.cjs');

const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()};
test('protected license clock survives restart and rejects a rollback beyond tolerance',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-clock-')),file=path.join(directory,'clock.enc'),now=Date.now();
  try{
    createTrustedClock(file,safeStorage).observe('user-a',now);
    const restarted=createTrustedClock(file,safeStorage);assert.equal(restarted.verify('user-a',now+3600000),true);
    assert.throws(()=>restarted.verify('user-a',now),/date\/time was changed/);
    assert.throws(()=>restarted.verify('unknown',now),/missing/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
