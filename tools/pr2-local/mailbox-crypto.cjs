'use strict';
const c=require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function publicKey(key,type){const k=c.createPublicKey(key);if(k.asymmetricKeyType!==type)throw Error('Wrong public key type');return k;}
function fingerprint(key,type){return c.createHash('sha256').update(publicKey(key,type).export({type:'spki',format:'der'})).digest('hex');}
function b64(value,max){if(typeof value!=='string'||value.length>max||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid encoding');return Buffer.from(value,'base64');}
function header({pair,id,kind,recipient,ephemeral,iv}){if(!uuid.test(pair)||!uuid.test(id)||!['job','result','pairing-probe'].includes(kind)||!/^[a-f0-9]{64}$/.test(recipient))throw Error('Invalid message binding');return {v:1,pair,id,kind,recipient,ephemeral,iv};}
function derive(privateKey,remoteKey,aad){const shared=c.diffieHellman({privateKey:c.createPrivateKey(privateKey),publicKey:publicKey(remoteKey,'x25519')});try{return Buffer.from(c.hkdfSync('sha256',shared,c.createHash('sha256').update(aad).digest(),'banksetu-pr2-mailbox-v1',32));}finally{shared.fill(0);}}
function seal(body,{pair,id,kind,recipientPublicKey,senderPrivateKey}){
 const signer=c.createPrivateKey(senderPrivateKey);if(signer.asymmetricKeyType!=='ed25519')throw Error('Wrong signing key type');
 const ephemeral=c.generateKeyPairSync('x25519');
 const h=header({pair,id,kind,recipient:fingerprint(recipientPublicKey,'x25519'),ephemeral:ephemeral.publicKey.export({type:'spki',format:'der'}).toString('base64'),iv:c.randomBytes(12).toString('base64')});
 const plaintext=Buffer.from(JSON.stringify(body));if(plaintext.length>131072)throw Error('Message too large');
 const aad=Buffer.from(JSON.stringify(h));const key=derive(ephemeral.privateKey.export({type:'pkcs8',format:'pem'}),recipientPublicKey,aad);
 try{const enc=c.createCipheriv('aes-256-gcm',key,Buffer.from(h.iv,'base64'));enc.setAAD(aad);const core={...h,ciphertext:Buffer.concat([enc.update(plaintext),enc.final()]).toString('base64'),tag:enc.getAuthTag().toString('base64')};return {...core,signature:c.sign(null,Buffer.from(JSON.stringify(core)),signer).toString('base64')};}finally{key.fill(0);plaintext.fill(0);}
}
function open(packet,{pair,id,kind,recipientPrivateKey,senderPublicKey}){
 if(!packet||Object.keys(packet).sort().join(',')!=='ciphertext,ephemeral,id,iv,kind,pair,recipient,signature,tag,v'||packet.v!==1)throw Error('Invalid sealed message');
 const h=header(packet);if(h.pair!==pair||h.id!==id||h.kind!==kind)throw Error('Message context mismatch');
 const own=c.createPrivateKey(recipientPrivateKey);if(own.asymmetricKeyType!=='x25519')throw Error('Wrong recipient key type');
 const ownPublic=c.createPublicKey(own).export({type:'spki',format:'pem'});if(h.recipient!==fingerprint(ownPublic,'x25519'))throw Error('Recipient mismatch');
 const ep=b64(h.ephemeral,128),iv=b64(h.iv,24),ciphertext=b64(packet.ciphertext,180000),tag=b64(packet.tag,24),sig=b64(packet.signature,88);
 if(iv.length!==12||tag.length!==16||sig.length!==64)throw Error('Invalid crypto lengths');
 const core={...h,ciphertext:packet.ciphertext,tag:packet.tag};
 if(!c.verify(null,Buffer.from(JSON.stringify(core)),publicKey(senderPublicKey,'ed25519'),sig))throw Error('Sender signature rejected');
 const aad=Buffer.from(JSON.stringify(h));const key=derive(recipientPrivateKey,{key:ep,type:'spki',format:'der'},aad);
 try{const dec=c.createDecipheriv('aes-256-gcm',key,iv);dec.setAAD(aad);dec.setAuthTag(tag);return JSON.parse(Buffer.concat([dec.update(ciphertext),dec.final()]).toString('utf8'));}finally{key.fill(0);}
}
module.exports={seal,open,fingerprint,uuid};
