/** Reviewed bank layout activation is intentionally separate from approved legacy
 * passbook engines. Version numbers/historical refs are never inferred from
 * other tenant's settings. */
export const MODE_KEYS=Object.freeze(["passbook","accountOpening"]);
export function layoutSelectionKey(tenantId, mode, output="quick", slot=1){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(String(tenantId||""))||!MODE_KEYS.includes(mode))
    throw Error("Invalid workspace or layout mode.");
  if(!Number.isSafeInteger(slot)||slot<1||slot>3||!["quick","dotmatrix"].includes(output))
    throw Error("Choose Quick or PR2 layout slot 1, 2 or 3.");
  if(mode==="accountOpening"&&(output!=="quick"||slot!==1))
    throw Error("Account Opening has its own single approved layout.");
  // Existing single selection remains the default Quick slot 1 for backward compatibility.
  if(mode==="accountOpening"||(output==="quick"&&slot===1))return tenantId+"-"+mode;
  return tenantId+"-"+mode+"-"+output+"-"+slot;
}
export function normalizedActivationRecord(previous, next, reviewerUid, at){
  const old=previous&&typeof previous==="object"?previous:{};
  const oldHistory=Array.isArray(old.history)?old.history.filter(item=>item&&typeof item==="object").slice(-9):[];
  const prior=String(old.templateId||"");
  const nextId=next===null?"":String(next);
  if(nextId&&!/^[a-f0-9-]{36}$/.test(nextId))throw Error("Invalid approved template ID.");
  if(prior===nextId)throw Error("Already selected; no changes were saved.");
  const revision=Number(old.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>1000000)throw Error("Version limit exceeded.");
  const history=prior?[...oldHistory,{templateId:prior,at:String(old.activatedAt||""),by:String(old.activatedBy||"")}].slice(-10):oldHistory;
  return {templateId:nextId,revision,history,activatedBy:reviewerUid,activatedAt:at};
}
export function previousApprovedVersion(record){
  const history=Array.isArray(record?.history)?record.history:[];
  return [...history].reverse().find(x=>/^[a-f0-9-]{36}$/.test(String(x?.templateId||"")))?.templateId||"";
}
