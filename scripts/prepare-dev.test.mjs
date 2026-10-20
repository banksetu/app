import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {missingDevDependencies,prepareDev} from './prepare-dev.mjs';

async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'banksetu-dev-deps-'));
  await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{'@capacitor/core':'8.5.2','@capacitor/app':'8.1.2'},devDependencies:{vite:'^8.3.0'}}));
  await writeFile(join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'node_modules/@capacitor/core':{version:'8.5.2'},'node_modules/@capacitor/app':{version:'8.1.2'},'node_modules/vite':{version:'8.3.1'}}}));
  const installPackage=async(name,version)=>{
    const dir=join(root,'node_modules',name);await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'package.json'),JSON.stringify({version}));
  };
  await installPackage('@capacitor/app','8.1.2');await installPackage('vite','8.3.1');
  return {root,installPackage,close:()=>rm(root,{recursive:true,force:true})};
}

test('the screenshot case repairs missing Capacitor before Vite can start',async()=>{
  const f=await fixture();
  try {
    assert.deepEqual(await missingDevDependencies(f.root),['@capacitor/core']);
    const originalLock=await readFile(join(f.root,'package-lock.json'),'utf8');
    let installs=0;
    await prepareDev({root:f.root,log:()=>{},install:async root=>{assert.equal(root,f.root);installs++;await f.installPackage('@capacitor/core','8.5.2');}});
    assert.equal(installs,1);assert.deepEqual(await missingDevDependencies(f.root),[]);
    await prepareDev({root:f.root,install:()=>{throw Error('must not reinstall a complete workspace');}});
    assert.equal(await readFile(join(f.root,'package-lock.json'),'utf8'),originalLock);
  } finally {await f.close();}
});

test('stale dependencies after pulling another branch are detected against the lockfile',async()=>{
  const f=await fixture();
  try {
    await f.installPackage('@capacitor/core','7.0.0');
    assert.deepEqual(await missingDevDependencies(f.root),['@capacitor/core']);
    await prepareDev({root:f.root,log:()=>{},install:async()=>f.installPackage('@capacitor/core','8.5.2')});
    assert.deepEqual(await missingDevDependencies(f.root),[]);
  } finally {await f.close();}
});

test('failed dependency repair stops dev startup with the actual failure',async()=>{
  const f=await fixture();
  try {
    await assert.rejects(prepareDev({root:f.root,log:()=>{},install:()=>{throw Error('npm network failure');}}),/npm network failure/);
    await assert.rejects(prepareDev({root:f.root,log:()=>{},install:()=>{}}),/still unavailable: @capacitor\/core/);
  } finally {await f.close();}
});

test('npm predev repairs packages before the existing client asset preparation',async()=>{
  const pkg=JSON.parse(await readFile(resolve(import.meta.dirname,'../package.json'),'utf8'));
  assert.equal(pkg.scripts.predev,'node scripts/prepare-dev.mjs && node scripts/prepare-client-assets.mjs');
  assert.equal(pkg.scripts.dev,'vite');
});
