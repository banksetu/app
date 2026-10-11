import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/App.tsx','utf8').replace(/^import[\s\S]*?;\s*$/gm,'');
const deps=['enrollOfflineSession','resumeOfflineSession','clearOfflineSession','startLocalSync','configureConnectionRecovery','resetSyncSession','syncNow','useCallback','useEffect','useRef','useState','useSyncExternalStore','bindLicenseAccount','resetLicensePermission','refreshLicensePermission','denyLicense','getLicensePermission','subscribeLicensePermission','requiresTenantLicense','onAuthStateChanged','signInWithEmailAndPassword','sendPasswordResetEmail','signOut','doc','onSnapshot','auth','db','callBankSetuWorker','Dashboard','PublicPages','LicenseOnboarding','getPublicLicenseSettings','setTenantApiUrl','setTenantWorkspaceReady'];
function harness(role='client_admin',status='approved'){
 const states=[],effects=[],storage=new Map();let profile,authChanged,workerCalls=0;
 globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 globalThis.document=new EventTarget();globalThis.window=new EventTarget();window.location={pathname:"/"};Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 const user={uid:'verified-user',email:'banksetu2026@gmail.com',emailVerified:true};
 const values={useSyncExternalStore:()=>({canWrite:false,warning:"Verify license",plan:null}),bindLicenseAccount:()=>{},resetLicensePermission:()=>{},refreshLicensePermission:async()=>{},denyLicense:()=>{},getLicensePermission:()=>({canWrite:false,plan:null}),subscribeLicensePermission:()=>()=>{},requiresTenantLicense:profile=>profile.role.startsWith("client_"),auth:{currentUser:user},db:{},useState:initial=>{const index=states.length;states.push(initial);return[initial,next=>{states[index]=typeof next==='function'?next(states[index]):next}]},useRef:current=>({current}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn,onAuthStateChanged:(_auth,fn)=>{authChanged=fn;return()=>{}},onSnapshot:(ref,_options,fn)=>{if(ref.collection==="users")profile=fn;return()=>{}},doc:(_db,collection)=>({collection}),signInWithEmailAndPassword:async()=>({user}),signOut:async()=>{},sendPasswordResetEmail:async()=>{},callBankSetuWorker:()=>{workerCalls++;return new Promise(()=>{})},enrollOfflineSession:async()=>{},resumeOfflineSession:async()=>{throw Error('No grant')},clearOfflineSession:async()=>{},startLocalSync:()=>()=>{},configureConnectionRecovery:()=>{},resetSyncSession:()=>{},syncNow:async()=>{},Dashboard:()=>null,PublicPages:()=>null,LicenseOnboarding:()=>null,getPublicLicenseSettings:async()=>null,setTenantApiUrl:()=>{},setTenantWorkspaceReady:ready=>ready?storage.set('bankSetuWorkspaceReady','true'):storage.delete('bankSetuWorkspaceReady')};
 return {values,states,effects,user,get workerCalls(){return workerCalls},authenticate:()=>authChanged(user),snapshot:()=>profile({metadata:{fromCache:false},exists:()=>true,data:()=>({role,status,subscriptionStatus:'active',...(role.startsWith('client_')?{tenantId:'tenant-a'}:{})})})};
}
for(const role of ['master_owner','client_admin','client_user'])test(`${role} navigation does not wait for a stalled Google backend`,async()=>{
 const h=harness(role);globalThis.__authHarness=h.values;
 const js=ts.transpileModule(`const {${deps.join(',')}}=globalThis.__authHarness;const React={createElement:()=>null};\n${source}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.React}}).outputText;
 const {default:App}=await import('data:text/javascript;base64,'+Buffer.from(js+"\n//# sourceURL=auth-fixture.mjs").toString('base64')+'#'+role);
 App();const cleanup=h.effects.map(fn=>fn()).filter(fn=>typeof fn==='function');
 try{const started=performance.now();h.authenticate();await h.snapshot();assert.equal(h.states[9],true);assert.equal(h.workerCalls,0);assert(performance.now()-started<5000);console.log(role+' mocked verified navigation '+Math.round(performance.now()-started)+' ms');}finally{cleanup.forEach(fn=>fn());}
});
test('blocked profile cannot navigate',async()=>{
 const h=harness('client_admin','blocked');globalThis.__authHarness=h.values;
 const js=ts.transpileModule(`const {${deps.join(',')}}=globalThis.__authHarness;const React={createElement:()=>null};\n${source}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.React}}).outputText;
 const {default:App}=await import('data:text/javascript;base64,'+Buffer.from(js+"\n//# sourceURL=auth-fixture.mjs").toString('base64')+'#blocked');App();const cleanup=h.effects.map(fn=>fn()).filter(fn=>typeof fn==='function');try{h.authenticate();await h.snapshot();assert.equal(h.states[9],false);}finally{cleanup.forEach(fn=>fn());}
});
