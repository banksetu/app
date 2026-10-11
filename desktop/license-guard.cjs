const {createPublicKey, verify} = require('node:crypto');

function signedClaims(signed, key) {
  if (!signed || typeof signed.payload !== 'string' || signed.payload.length > 20000 ||
      typeof signed.signature !== 'string' || signed.signature.length > 1024 ||
      !verify('RSA-SHA256', Buffer.from(signed.payload), key, Buffer.from(signed.signature, 'base64url')))
    throw Error('Signed workspace authorization is invalid. Reconnect before changing local data.');
  return JSON.parse(signed.payload);
}

function createLicenseGuard(publicKey) {
  if (publicKey?.kty !== 'RSA' || !publicKey.n || !publicKey.e || publicKey.d)
    throw Error('The trusted license public key is missing. Update Bank Setu.');
  const key = createPublicKey({key: publicKey, format: 'jwk'});
  return (store, scope, receipt, now = Date.now()) => {
    if (scope.startsWith('offline:')) return false; // Account grant enrollment is a separate metadata transaction.
    const uid = scope.split(':', 1)[0];
    const saved = store.read(`offline:${uid}`).offlineSession;
    const protectedScope = store.isLicensed(scope);
    if (!saved) throw Error('Verify this workspace online before saving customer changes. Local data was retained.');
    const grant = signedClaims(saved, key);
    if (!grant.uid || grant.uid !== uid || !['approved'].includes(grant.status) ||
        grant.subscriptionStatus !== 'active' || !Number.isFinite(grant.issuedAt) ||
        !Number.isFinite(grant.expiresAt) || grant.issuedAt > now + 300000 || grant.expiresAt <= now ||
        grant.expiresAt - grant.issuedAt > (['client_admin','client_user'].includes(grant.role) ? 5 * 86400000 : 8 * 3600000))
      throw Error('Workspace authorization expired. Reconnect; customer data was retained.');
    const tenant = grant.demoOnly ? `demo:${grant.tenantId}` : grant.tenantId;
    if (scope !== `${uid}:${tenant}:${grant.connectionId}` ||
        (grant.demoOnly && (grant.licenseRequired !== true || grant.connectionId !== 'demo-sample')))
      throw Error('Customer workspace does not match the signed account grant.');
    if (['master_owner','admin'].includes(grant.role) && grant.tenantId===`master:${uid}` && !grant.demoOnly) {
      if(protectedScope)throw Error('A client workspace cannot become a master workspace.');
      return false;
    }
    if(!['client_admin','client_user'].includes(grant.role))throw Error('Signed client authorization is required.');
    const claim = signedClaims(receipt, key);
    if (claim.purpose !== 'banksetu-license-v1' || claim.uid !== uid || claim.tenantId !== grant.tenantId ||
        (!Number.isInteger(claim.revision) || claim.revision<0) || !Number.isFinite(claim.issuedAt) ||
        !Number.isFinite(claim.validUntil) || claim.issuedAt > now + 300000 ||
        claim.validUntil <= now || claim.validUntil<=claim.issuedAt || claim.validUntil - claim.issuedAt > 5 * 86400000 || !['annual','lifetime','demo'].includes(claim.plan) ||
        !(['active', 'expiring_soon'].includes(claim.state) || (grant.demoOnly && claim.state === 'demo_active')) ||
        (!grant.demoOnly && claim.plan === 'demo') || (grant.demoOnly && claim.plan !== 'demo') ||
        ((claim.plan === 'annual' || claim.plan === 'demo') &&
          (!Number.isFinite(Date.parse(claim.expiresAt)) || now >= Date.parse(claim.expiresAt) || claim.validUntil > Date.parse(claim.expiresAt))))
      throw Error('License is pending, expired or belongs to another workspace. Local data was retained.');
    const known=store.getLicenseAuthorization?.(`${uid}:${grant.tenantId}`);
    if(known){
      const authorization=signedClaims(known,key);
      if(!authorization.canWrite||authorization.revision!==claim.revision)throw Error('License authorization revision was superseded.');
    }
    return true;
  };
}

function createLicenseAuthority(publicKey,store){
  const key=createPublicKey({key:publicKey,format:'jwk'});
  let uid='',receipt;
  const authorize=createLicenseGuard(publicKey);
  const session=value=>{uid=value;receipt=undefined;};
  const status=(signed,now=Date.now())=>{
    const claim=signedClaims(signed,key);
    if(claim.purpose!=='banksetu-license-status-v1'||claim.uid!==uid||!claim.tenantId||!Number.isInteger(claim.revision)||claim.revision<0||!Number.isFinite(claim.issuedAt)||!Number.isFinite(claim.validUntil)||claim.issuedAt>now+300000||claim.validUntil<=now||claim.validUntil<=claim.issuedAt||claim.validUntil-claim.issuedAt>5*86400000||typeof claim.canWrite!=='boolean'||claim.canWrite!==['active','expiring_soon','demo_active'].includes(claim.state))throw Error('Invalid signed license status.');
    const identity=`${uid}:${claim.tenantId}`,known=store.getLicenseAuthorization(identity);
    if(known){const prior=signedClaims(known,key);if(claim.revision<prior.revision||claim.revision===prior.revision&&claim.issuedAt<prior.issuedAt)throw Error('License authorization revision is stale.');}
    store.saveLicenseAuthorization(identity,signed);
    if(!claim.canWrite)receipt=undefined;
  };
  const currentScope=()=>{
    if(!uid)throw Error('Sign in and verify the license before printing.');
    const saved=store.read(`offline:${uid}`).offlineSession;
    const grant=signedClaims(saved,key);
    return `${uid}:${grant.demoOnly?'demo:':''}${grant.tenantId}:${grant.connectionId}`;
  };
  const acceptReceipt=(signed,now=Date.now())=>{
    const claim=signedClaims(signed,key),known=store.getLicenseAuthorization(`${uid}:${claim.tenantId}`);
    const status=known?signedClaims(known,key):null;
    if(claim.purpose!=='banksetu-license-v1'||claim.uid!==uid||!claim.tenantId||!Number.isInteger(claim.revision)||claim.revision<0||!Number.isFinite(claim.issuedAt)||!Number.isFinite(claim.validUntil)||claim.issuedAt>now+300000||claim.validUntil<=now||claim.validUntil<=claim.issuedAt||claim.validUntil-claim.issuedAt>5*86400000||!['annual','lifetime','demo'].includes(claim.plan)||!(claim.plan==='demo'?claim.state==='demo_active':['active','expiring_soon'].includes(claim.state))||(['annual','demo'].includes(claim.plan)&&(!Number.isFinite(Date.parse(claim.expiresAt))||now>=Date.parse(claim.expiresAt)||claim.validUntil>Date.parse(claim.expiresAt)))||status&&(!status.canWrite||status.revision!==claim.revision))throw Error('License authorization is expired or superseded.');
    receipt=signed;
  };
  const protectedAction=()=>{authorize(store,currentScope(),receipt);};
  const commit=(scope,signed)=>{
    if(scope.startsWith('offline:'))return false;
    if(scope!==currentScope())throw Error('The active signed-in workspace changed.');
    const grant=signedClaims(store.read(`offline:${uid}`).offlineSession,key);
    if(['client_admin','client_user'].includes(grant.role)&&(!receipt||signed?.payload!==receipt.payload||signed?.signature!==receipt.signature))throw Error('Verify the current license before saving customer changes.');
    return authorize(store,scope,signed);
  };
  return {session,status,acceptReceipt,protectedAction,commit};
}
module.exports = {createLicenseGuard,createLicenseAuthority};
