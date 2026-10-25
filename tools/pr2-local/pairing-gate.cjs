'use strict';
const crypto=require('node:crypto');
// Evidence is a trusted local capability object, never a downloaded manifest.
function readiness({keyStore,localCredentialStore,verifiedPackage=false,transportProbe=false,pairedDevice=false}={}){
 const missing=[];
 if(!keyStore||typeof keyStore.sign!=='function'||typeof keyStore.decrypt!=='function'||keyStore.durable!==true||keyStore.secretExportable!==false)missing.push('durable non-exporting Work Mode signing/decryption provider');
 if(!localCredentialStore||localCredentialStore.currentUserProtected!==true||localCredentialStore.repository!=='banksetu/app')missing.push('Windows current-user protected GitHub credential');
 if(!verifiedPackage)missing.push('independently verified package and signer fingerprint');
 if(!transportProbe)missing.push('fresh authenticated encrypted round-trip pairing proof');
 if(!pairedDevice)missing.push('operator-confirmed local USB hardware/device binding');
 return {ready:missing.length===0,missing,mayOpenPrinter:missing.length===0};
}
function pairingRequest({pair,deviceId,bundleHash,controllerSigningPublicKey,controllerEncryptionPublicKey}){
 if(!/^[a-f0-9-]{36}$/.test(pair)||!/^[a-f0-9]{64}$/.test(deviceId)||!/^[a-f0-9]{64}$/.test(bundleHash))throw Error('Invalid pairing request');
 for(const [pem,type]of [[controllerSigningPublicKey,'ed25519'],[controllerEncryptionPublicKey,'x25519']])if(crypto.createPublicKey(pem).asymmetricKeyType!==type)throw Error('Wrong pairing key');
 // Keep this request private until it is sealed to the approval service.
 return {version:1,pair,deviceId,bundleHash,controllerSigningPublicKey,controllerEncryptionPublicKey,expiresAt:Date.now()+300000};
}
module.exports={readiness,pairingRequest};
