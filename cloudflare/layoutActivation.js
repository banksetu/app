/** Reviewed bank layout activation is intentionally separate from approved legacy
 * passbook engines. Version numbers/historical refs are never inferred from
 * other tenant's settings. */
export const MODE_KEYS=Object.freeze(["passbook","accountOpening"]);
export function layoutSelectionKey(tenantId, mode){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(String(tenantId||""))||!MODE_KEYS.includes(mode))
    throw Error("Invalid workspace or layout mode.");
  return tenantId+"-"+mode;
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
