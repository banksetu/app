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
    if (!saved) {
      // Existing legacy customer data stays readable and writable while its
      // entitlement is migrated. A new workspace cannot create records without
      // a verified signed account grant.
      const old = store.read(scope);
      if (protectedScope || (!old.records.length && !old.operations.length))
        throw Error('Verify this workspace online before saving customer changes. Local data was retained.');
      return false;
    }
    const grant = signedClaims(saved, key);
    if (!grant.uid || grant.uid !== uid || !['approved'].includes(grant.status) ||
        grant.subscriptionStatus !== 'active' || !Number.isFinite(grant.issuedAt) ||
        !Number.isFinite(grant.expiresAt) || grant.issuedAt > now + 300000 || grant.expiresAt <= now ||
        grant.expiresAt - grant.issuedAt > (grant.licenseRequired === true ? 5 * 86400000 : 8 * 3600000))
      throw Error('Workspace authorization expired. Reconnect; customer data was retained.');
    const tenant = grant.demoOnly ? `demo:${grant.tenantId}` : grant.tenantId;
    if (scope !== `${uid}:${tenant}:${grant.connectionId}` ||
        (grant.demoOnly && (grant.licenseRequired !== true || grant.connectionId !== 'demo-sample')))
      throw Error('Customer workspace does not match the signed account grant.');
    if (grant.licenseRequired !== true) {
      if (protectedScope) throw Error('This licensed workspace needs a current signed license.');
      return false;
    }
    const claim = signedClaims(receipt, key);
    if (claim.purpose !== 'banksetu-license-v1' || claim.uid !== uid || claim.tenantId !== grant.tenantId ||
        !Number.isInteger(claim.revision) || !Number.isFinite(claim.issuedAt) ||
        !Number.isFinite(claim.validUntil) || claim.issuedAt > now + 300000 ||
        claim.validUntil <= now || claim.validUntil - claim.issuedAt > 5 * 86400000 ||
        !(['active', 'expiring_soon'].includes(claim.state) || (grant.demoOnly && claim.state === 'demo_active')) ||
        (!grant.demoOnly && claim.plan === 'demo') || (grant.demoOnly && claim.plan !== 'demo') ||
        ((claim.plan === 'annual' || claim.plan === 'demo') &&
          (!Number.isFinite(Date.parse(claim.expiresAt)) || now >= Date.parse(claim.expiresAt) || claim.validUntil > Date.parse(claim.expiresAt))))
      throw Error('License is pending, expired or belongs to another workspace. Local data was retained.');
    return true;
  };
}

module.exports = {createLicenseGuard};
