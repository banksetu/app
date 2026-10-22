const encoder = new TextEncoder();
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
export async function createOfflineSession(accountJson, claims) {
  const account = JSON.parse(accountJson);
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const bytes = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const algorithm = {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"};
  const key = await crypto.subtle.importKey("pkcs8",bytes,algorithm,true,["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk",key);
  const publicKey = {kty:"RSA",n:jwk.n,e:jwk.e,alg:"RS256",ext:true,key_ops:["verify"]};
  const payload = JSON.stringify(claims);
  const signature = await crypto.subtle.sign(algorithm,key,encoder.encode(payload));
  return {payload,signature:base64(new Uint8Array(signature)),publicKey};
}
