import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,serverTimestamp,setDoc} from 'firebase/firestore';

const env=await initializeTestEnvironment({projectId:'synthetic-banksetu-license',firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const [uid,tenantId,licenseRequired] of [['legacy','legacy-tenant',false],['licensed','licensed-tenant',true],['foreign','foreign-tenant',true]]){
   await setDoc(doc(db,'users',uid),{role:'client_admin',tenantId,status:'approved',subscriptionStatus:'active',licenseRequired});
   await setDoc(doc(db,'tenantSettings',tenantId),{tenantId,bankName:'Synthetic Bank',apiUrl:'https://script.google.com/macros/s/synthetic/exec',spreadsheetId:'synthetic-sheet',photoFolderId:'synthetic-folder',bankInfo:{},bankLogo:'',updatedBy:uid,updatedAt:new Date()});
  }
 });
 const legacy=env.authenticatedContext('legacy').firestore();
 const licensed=env.authenticatedContext('licensed').firestore();
 const foreign=env.authenticatedContext('foreign').firestore();
 await assertSucceeds(getDoc(doc(licensed,'tenantSettings','licensed-tenant')));
 await assertFails(getDoc(doc(foreign,'tenantSettings','licensed-tenant')));
 await assertFails(setDoc(doc(legacy,'tenantSettings','legacy-tenant'),{bankInfo:{branch:'Synthetic'},updatedBy:'legacy',updatedAt:serverTimestamp()},{merge:true}));
 await assertFails(setDoc(doc(licensed,'tenantSettings','licensed-tenant'),{bankInfo:{branch:'Bypass'},updatedBy:'licensed',updatedAt:serverTimestamp()},{merge:true}));
 await assertFails(setDoc(doc(licensed,'tenantSettings','foreign-tenant'),{bankInfo:{branch:'Foreign'},updatedBy:'licensed',updatedAt:serverTimestamp()},{merge:true}));
 console.log('Tenant settings: all client direct writes denied, reads tenant scoped.');
}finally{await env.cleanup();}
