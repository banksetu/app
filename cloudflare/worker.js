import { masterUsage } from "./masterStatus.js";
import { DEFAULT_FLAGS, DEFAULT_PRICING, DEFAULT_PAYMENT_DETAILS, validatePaymentDetails, validatePricing, validateInquiry, licenseView, upgradeAmount, transitionLicense, currentTenantRecords } from "./licensing.js";
import { createOfflineSession } from "./offlineSession.js";
import { parseGoogleResource, validateResourceOwnership } from "./googleConnection.js";
import { createSupportMediaService } from "./supportMedia.js";
export function workspaceBankSettingsPath(actor) {
  const role = String(actor.profile?.role || "").toLowerCase();
  if (role === "client_admin" && actor.profile.tenantId) return "/tenantSettings/" + encodeURIComponent(actor.profile.tenantId);
  if (isMasterActor(actor)) return "/appSettings/" + encodeURIComponent(actor.uid);
  return "";
}
export function validateWorkspaceBankPatch(body) {
  const output = {};
  if (body.bankInfo !== undefined) {
    const input = body.bankInfo;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter valid bank information.");
    const limits = { bankName:120, passbookBank:120, branchName:120, cspCode:80, operatorName:120, address:500 };
    const bankInfo = {};
    for (const [key,limit] of Object.entries(limits)) {
      if (typeof input[key] !== "string" || input[key].trim().length > limit) throw new Error("Enter valid bank, branch and operator details.");
      bankInfo[key] = input[key].trim();
    }
    // Optional for older clients/workspaces. Keep unrelated tenant settings intact.
    const extraLimits = {branchAddress:240,branchPostOffice:120,branchDistrict:120,branchState:120,branchPinCode:6,branchEmail:254,branchPhone:30,ifsc:11,micr:9,branchCode:20,gstin:15,ckyc:30};
    for (const [key,limit] of Object.entries(extraLimits)) {
      if (input[key] === undefined) continue;
      if (typeof input[key] !== "string" || input[key].trim().length > limit) throw new Error("Enter valid passbook branch details.");
      bankInfo[key] = input[key].trim();
    }
    if (bankInfo.branchPinCode && !/^\d{6}$/.test(bankInfo.branchPinCode)) throw new Error("Branch PIN must have six digits.");
    if (bankInfo.ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(bankInfo.ifsc)) throw new Error("Enter a valid 11-character IFSC.");
    if (bankInfo.micr && !/^\d{9}$/.test(bankInfo.micr)) throw new Error("Branch MICR must have nine digits.");
    if (bankInfo.gstin && !/^[A-Za-z0-9]{15}$/.test(bankInfo.gstin)) throw new Error("GSTIN must have 15 letters and digits.");
    if (bankInfo.branchEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bankInfo.branchEmail)) throw new Error("Enter a valid branch email.");
    if (!bankInfo.bankName || !bankInfo.passbookBank) throw new Error("Enter Bank / CSP name and select a bank.");
    Object.assign(output, bankInfo, { bankInfo });
  }
  if (body.bankLogo !== undefined) {
    if (typeof body.bankLogo !== "string" || body.bankLogo.length > 150000 ||
        (body.bankLogo !== "" && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.bankLogo))) throw new Error("Choose a valid bank logo up to 110 KB after resizing.");
    output.bankLogo = body.bankLogo;
  }
  if (!Object.keys(output).length) throw new Error("Provide bank information or a bank logo to save.");
  return output;
}

export function bankFormatSelectionError(selectedBank, requestedBank) {
  const key = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const selected = key(selectedBank);
  if (!selected || selected !== key(requestedBank)) return "Select and save your bank in Bank Information before uploading its formats.";
  if (/^(assam gramin(?: vikas)? bank|agvb|agb)$/.test(selected)) return "Assam Gramin Bank uses the built-in formats; no samples are required.";
  return "";
}

const encoder = new TextEncoder();
let cachedAccessToken;
let cachedTokenExpiry = 0;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function utf8b64url(value) {
  return b64url(encoder.encode(value));
}

function decodePem(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serviceAccessToken(env) {
  if (cachedAccessToken && Date.now() < cachedTokenExpiry - 60_000) return cachedAccessToken;
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = utf8b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = utf8b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", decodePem(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${b64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error("Could not authorize the trusted Firebase service.");
  cachedAccessToken = token.access_token;
  cachedTokenExpiry = Date.now() + Number(token.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

let driveToken = null;
let driveExpiry = 0;
async function driveServiceAccessToken(env) {
  if (driveToken && Date.now() < driveExpiry - 60000) return driveToken;
  if (!env.GOOGLE_DRIVE_SERVICE_ACCOUNT) throw new Error("The dedicated Google sync backend secret is not configured.");
  const account = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT);
  if (account.client_email !== "bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com") throw new Error("Use the dedicated Bank Setu Drive service account.");
  const now = Math.floor(Date.now()/1000);
  const unsigned = utf8b64url(JSON.stringify({alg:"RS256",typ:"JWT"})) + "." + utf8b64url(JSON.stringify({iss:account.client_email,scope:"https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const key = await crypto.subtle.importKey("pkcs8",decodePem(account.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64url(new Uint8Array(signature))})});
  const value = await response.json();
  if (!response.ok || !value.access_token) throw new Error("Google sync service authorization failed.");
  driveToken=value.access_token;driveExpiry=Date.now()+Number(value.expires_in||3600)*1000;return driveToken;
}

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  return undefined;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new Error("Unsupported Firestore value.");
}

function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

export function firestoreDocumentName(env, path) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${path}`;
}

async function firestoreRequest(env, path, options = {}) {
  const token = await serviceAccessToken(env);
  const response = await fetch(`${firestoreBase(env)}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || "Firebase data request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getProfile(env, uid) {
  try {
    const result = await firestoreRequest(env, `/users/${encodeURIComponent(uid)}`);
    return decodeFields(result.fields || {});
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function verifyActor(request, env) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return { error: json({ error: "Sign in is required." }, 401) };
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const result = await response.json().catch(() => ({}));
  const account = result.users?.[0];
  if (!response.ok || !account?.localId) return { error: json({ error: "Your login has expired. Please sign in again." }, 401) };
  const profile = await getProfile(env, account.localId);
  if (!profile || profile.status !== "approved" || profile.subscriptionStatus !== "active") {
    return { error: json({ error: "This account is not active." }, 403) };
  }
  // Legacy `admin` accounts historically received Master Sheet access. Restrict
  // that compatibility role to the verified owner identity only.
  if (String(profile.role || "").toLowerCase() === "admin" &&
      (String(account.email || "").trim().toLowerCase() !== "banksetu2026@gmail.com" || account.emailVerified !== true)) {
    return { error: json({ error: "This legacy administrator is not the verified Master Admin account." }, 403) };
  }
  const role = String(profile.role || "").toLowerCase();
  let workspaceStatus = "";
  if (["client_admin", "client_user"].includes(role)) {
    const tenantId = String(profile.tenantId || "").trim();
    if (!tenantId) return { error: json({ error: "This account has no client workspace." }, 403) };
    const tenant = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    // Repair an orphaned, approved Client Admin's missing tenant record during
    // setup. A normal data/write request can never create or reopen a tenant.
    const readOnlySetupCheck = new URL(request.url).pathname === "/get-google-setup";
    let verifiedTenant = tenant;
    if (!verifiedTenant && readOnlySetupCheck && role === "client_admin") {
      verifiedTenant = await recoverMissingClientTenant(env, account.localId, profile, tenantId);
    }
    workspaceStatus = String(decodeFields(verifiedTenant?.fields || {}).status || "unavailable");
    // Let clients read setup status while blocked; all write and customer-data
    // routes remain blocked until the Master Admin restores the workspace.
    if (!verifiedTenant || (workspaceStatus !== "active" && !readOnlySetupCheck)) {
      return { error: json({ error: "This client workspace is blocked or unavailable." }, 403) };
    }
  }
  // Every client write requires the tenant entitlement, independent of profile flags.
  // Licensing, setup reads and account recovery remain available after expiry.
  if (["client_admin", "client_user"].includes(role) && !["/license-me", "/license-my-requests", "/license-request-change", "/get-offline-session", "/push-register", "/push-unregister"].includes(new URL(request.url).pathname)) {
    const path = `/tenantLicenses/${encodeURIComponent(String(profile.tenantId || ""))}`;
    const document = await firestoreRequest(env, path).catch(error => error.status === 404 ? null : Promise.reject(error));
    const license = decodeFields(document?.fields || {});
    const pricing = decodeFields((await firestoreRequest(env, "/appSettings/licensing").catch(error => error.status === 404 ? null : Promise.reject(error)))?.fields || {}).pricing || {};
    if (license.tenantId && license.tenantId !== profile.tenantId) return {error:json({error:"License tenant mismatch."},403)};
    const view = licenseView(license.tenantId ? license : {status:"pending"}, Date.now(), Number.isInteger(pricing.graceDays) ? pricing.graceDays : 7);
    const route=new URL(request.url).pathname;
    if (!view.canWrite && route !== "/get-google-setup") return { error: json({ error: "License renewal is required. Existing data is retained." }, 403) };
  }
  return {
    uid: account.localId,
    profile,
    workspaceStatus,
    email: String(account.email || ""),
    emailVerified: account.emailVerified === true,
  };
}

function isMasterActor(actor) {
  const role = String(actor.profile?.role || "").toLowerCase();
  return role === "master_owner" || (
    role === "admin" &&
    String(actor.email || "").trim().toLowerCase() === "banksetu2026@gmail.com" &&
    actor.emailVerified === true
  );
}

async function patchUser(env, uid, fields) {
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  return firestoreRequest(env, `/users/${encodeURIComponent(uid)}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
}

async function putDocument(env, path, fields) {
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  return firestoreRequest(env, `${path}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
}

const pushTokenPattern = /^[A-Za-z0-9_:\-]{80,4096}$/;
const pushDevicePattern = /^[a-f0-9-]{36}$/;
const PUSH_RETENTION_MS = 30 * 86400000;
const SYNC_PUSH_COOLDOWN_MS = 5 * 60000;
export function validatePushRegistration(body) {
  if (!pushDevicePattern.test(String(body.deviceId || "")) || !pushTokenPattern.test(String(body.token || ""))) return false;
  return body.platform === "android";
}

async function handlePushRegistration(request, env, actor, route) {
  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.deviceId || "");
  if (!pushDevicePattern.test(deviceId)) return json({ error: "Invalid device registration." }, 400);
  if (route === "/push-register" && !validatePushRegistration(body)) return json({ error: "Invalid Android push token." }, 400);
  const tenantId = isMasterActor(actor) ? `master:${actor.uid}` : String(actor.profile.tenantId || "");
  if (!tenantId) return json({ error: "A verified workspace is required." }, 403);
  const path = `/pushDevices/${encodeURIComponent(deviceId)}`;
  const existing = await firestoreRequest(env, path).catch(error => error.status === 404 ? null : Promise.reject(error));
  const old = decodeFields(existing?.fields || {});
  // An installation can belong to only one account/tenant at a time.
  const now = Date.now();
  if (route === "/push-unregister") {
    if (old.uid === actor.uid) await firestoreRequest(env, path, { method: "DELETE" });
    return json({ success: true });
  }
  if (old.uid === actor.uid && old.tenantId === tenantId && old.token === body.token && old.scopedData === (body.scopedData===true) && old.isMaster === isMasterActor(actor) &&
      Date.parse(old.expiresAt || "") > now && Date.parse(old.updatedAt || "") > now - 60_000)
    return json({ success: true, throttled: true });
  if (!existing) {
    const rows = await firestoreRequest(env, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "pushDevices" }],
      where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: actor.uid } } }, limit: 5,
    } }) });
    if (rows.filter(row => Date.parse(decodeFields(row.document?.fields || {}).expiresAt || "") > now).length >= 5) return json({ error: "Too many registered devices." }, 429);
  }
  await putDocument(env, path, { uid: actor.uid, tenantId, token: body.token, scopedData:body.scopedData===true,isMaster:isMasterActor(actor),platform: "android", expiresAt: new Date(now + 30 * 86400000), updatedAt: new Date(now).toISOString() });
  return json({ success: true });
}

async function pushEventId(tenantId, eventId) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tenantId + ":" + eventId)))].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function preparePushJob(env, tenantId, event) {
  const tenant = await licenseDoc(env, "/tenants/" + encodeURIComponent(tenantId));
  if (licenseFields(tenant).status !== "active") return null;
  const rows = await firestoreRequest(env, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "pushDevices" }],
    where: { fieldFilter: { field: { fieldPath: "tenantId" }, op: "EQUAL", value: { stringValue: tenantId } } }, limit: 100,
  } }) });
  const seen = new Set();
  const deviceIds = rows.filter(row => {const record=licenseFields(row.document), key=record.uid+":"+record.token;if(seen.has(key))return false;seen.add(key);return true;}).map(row=>row.document?.name?.split("/").pop()).filter(id=>pushDevicePattern.test(id||""));
  const now=Date.now();
  return deviceIds.length ? { targetMode:"tenant",tenantId, event, priority:event.category==="update"?1:0,deviceIds, cursor: 0, leaseUntil: 0, createdAt: new Date(now).toISOString(), expiresAt:new Date(now+PUSH_RETENTION_MS) } : null;
}

async function prepareUserPushJob(env, recipientUids, event, excludeUid="") {
  const targets=[...new Set(recipientUids.map(value=>String(value||'')).filter(value=>value&&value!==excludeUid&&value.length<=128))];
  if(!targets.length)return null;
  const documents=[];
  for(const target of targets){
    const rows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{
      from:[{collectionId:"pushDevices"}],where:{fieldFilter:{field:{fieldPath:"uid"},op:"EQUAL",value:{stringValue:target}}},limit:5
    }})});
    documents.push(...rows.filter(row=>row.document).map(row=>row.document));
  }
  const seen=new Set(),deviceIds=documents.filter(document=>{const record=licenseFields(document),key=record.uid+":"+record.token;if(seen.has(key))return false;seen.add(key);return true;}).map(document=>document.name?.split('/').pop()).filter(id=>pushDevicePattern.test(id||''));
  const now=Date.now();
  return deviceIds.length?{targetMode:"users",targetUids:targets,tenantId:"support",event,priority:0,deviceIds,cursor:0,leaseUntil:0,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+PUSH_RETENTION_MS)}:null;
}

export async function drainQueuedPush(env, tenantId, eventDocId) {
  // Eight recipients and a persisted lease/cursor keep every invocation below
  // Workers Free's 50 external subrequests; larger tenants continue next time.
  let doc;
  if(eventDocId)doc=await licenseDoc(env,"/pendingPushEvents/"+eventDocId);
  else{
    const read=async priority=>firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{
      from:[{collectionId:"pendingPushEvents"}],
      where:{fieldFilter:{field:{fieldPath:tenantId?"tenantId":"priority"},op:"EQUAL",value:tenantId?{stringValue:tenantId}:{integerValue:String(priority)}}},limit:1
    }})});
    let rows=await read(0);if(!tenantId&&!rows[0]?.document)rows=await read(1);doc=rows[0]?.document;
  }
  if (!doc) return;
  const id = doc.name.split("/").pop(), job = licenseFields(doc), now = Date.now();
  if (Date.parse(job.expiresAt || "") <= now) {
    await licenseCommit(env,[{delete:doc.name,currentDocument:{updateTime:doc.updateTime}}]).catch(()=>undefined);
    return;
  }
  if (Number(job.leaseUntil || 0) > now) return;
  if (!Array.isArray(job.deviceIds) || !job.event || !job.tenantId) return;
  try { await licenseCommit(env, [licenseWrite(env, "pendingPushEvents", id, {...job, leaseUntil:now + 60_000}, {updateTime:doc.updateTime})]); }
  catch(error){if([409,412].includes(error.status))return;throw error;}
  const claimed = await licenseDoc(env, "/pendingPushEvents/" + id);
  if (!claimed) return;
  if(job.targetMode!=="users"){
    const tenant = await licenseDoc(env, "/tenants/" + encodeURIComponent(job.tenantId));
    if (licenseFields(tenant).status !== "active") {
      await licenseCommit(env, [{delete:claimed.name,currentDocument:{updateTime:claimed.updateTime}}]);return;
    }
  }
  const profiles = new Map(),tenants=new Map(), tokens = new Set(), stale = [], started = Date.now();
  let cursor = Math.max(0, Number(job.cursor || 0));
  for (let count = 0; cursor < job.deviceIds.length && count < 8 && Date.now() - started < 15_000; count++, cursor++) {
    const deviceId = job.deviceIds[cursor];
    if (!pushDevicePattern.test(String(deviceId))) continue;
    const device = await licenseDoc(env, "/pushDevices/" + encodeURIComponent(deviceId)), record = licenseFields(device);
    if (!device || (job.targetMode!=="users"&&record.tenantId !== job.tenantId) || !record.uid || !pushTokenPattern.test(String(record.token || "")) || !Number.isFinite(Date.parse(record.expiresAt || "")) || Date.parse(record.expiresAt) <= now) continue;
    if(job.targetMode==="users"&&(!Array.isArray(job.targetUids)||!job.targetUids.includes(record.uid)))continue;
    if (!profiles.has(record.uid)) profiles.set(record.uid, await getProfile(env, record.uid));
    const profile = profiles.get(record.uid);
    if(job.targetMode==="users"){
      const role=String(profile?.role||'').toLowerCase(),masterScope=String(record.tenantId||'').startsWith('master:');
      if(masterScope){if(!['master_owner','master_admin','admin'].includes(role))continue;}
      else{
        if(profile?.tenantId!==record.tenantId||profile.status!=="approved"||profile.subscriptionStatus!=="active")continue;
        if(!tenants.has(record.tenantId))tenants.set(record.tenantId,licenseFields(await licenseDoc(env,"/tenants/"+encodeURIComponent(record.tenantId))));
        if(tenants.get(record.tenantId)?.status!=="active")continue;
      }
    }else if (profile?.tenantId !== job.tenantId || profile.status !== "approved" || profile.subscriptionStatus !== "active") continue;
    if(tokens.has(record.token))continue;
    tokens.add(record.token);
    const event = job.event;
    let result;
    try { result = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) + "/messages:send", {
      method:"POST", headers:{authorization:"Bearer " + await serviceAccessToken(env),"content-type":"application/json"}, signal:AbortSignal.timeout(5000),
      // High-priority data-only delivery always reaches the scoped native
      // service, including when the WebView is closed. The service verifies the
      // bound UID/workspace before it displays a generic OS notification.
      body:JSON.stringify({message:{token:record.token,
        data:{page:event.page||"license-management",category:event.category||"license",eventId:event.id,uid:record.uid,tenantId:record.tenantId,title:event.title,body:event.body},
        android:{priority:"HIGH",ttl:"604800s"}
      }})
    }); } catch { break; } // Keep this recipient queued for the next invocation.
    if (!result.ok) {
      const failure = await result.json().catch(() => ({})), code = failure.error?.details?.[0]?.errorCode;
      if (!["UNREGISTERED","SENDER_ID_MISMATCH","INVALID_ARGUMENT"].includes(code)) break;
      if (code === "UNREGISTERED") stale.push({delete:device.name,currentDocument:{updateTime:device.updateTime}});
    }
  }
  await licenseCommit(env, [...stale, cursor >= job.deviceIds.length
    ? {delete:claimed.name,currentDocument:{updateTime:claimed.updateTime}}
    : licenseWrite(env,"pendingPushEvents",id,{...job,cursor,leaseUntil:0},{updateTime:claimed.updateTime})]);
}

export async function sendTenantPush(env, tenantId, event) {
  // Queue only committed server events. No UI or service-account key is needed.
  try {
    const id = await pushEventId(tenantId, event.id), job = await preparePushJob(env, tenantId, event);
    if (!job) return;
    try { await licenseCommit(env,[licenseWrite(env,"pendingPushEvents",id,job,{exists:false})]); }
    catch(error){if(![409,412].includes(error.status))throw error;}
    await drainQueuedPush(env, tenantId, id);
  } catch(error){console.warn("Bank Setu push delivery queued/unavailable",error instanceof Error?error.message:"unknown");}
}

export async function sendUserPush(env, recipientUids, event, excludeUid="") {
  try{
    const targets=[...new Set(recipientUids)].sort(),scope=`support:${targets.join(',')}`,id=await pushEventId(scope,event.id),job=await prepareUserPushJob(env,targets,event,excludeUid);
    if(!job)return false;
    try{await licenseCommit(env,[licenseWrite(env,"pendingPushEvents",id,job,{exists:false})]);}
    catch(error){if(![409,412].includes(error.status))throw error;}
    await drainQueuedPush(env,"support",id);
    return true;
  }catch(error){console.warn("Bank Setu user push queued/unavailable",error instanceof Error?error.message:"unknown");return false;}
}

async function handlePushTest(env,actor){
  const queued=await sendUserPush(env,[actor.uid],{id:`test:${Date.now()}`,title:"Bank Setu notifications enabled",body:"Android background notifications are connected to this signed-in account.",category:"update",page:"dashboard"});
  return json({success:true,queued,message:queued?"Test notification sent.":"No registered Android device was found. Re-enable System notifications and retry."});
}

async function supportMasterUids(env){
  const rows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:"pushDevices"}],where:{fieldFilter:{field:{fieldPath:"isMaster"},op:"EQUAL",value:{booleanValue:true}}},limit:20}})});
  return [...new Set(rows.map(row=>licenseFields(row.document).uid).filter(Boolean))];
}

async function sendSupportPush(env,actor,result){
  if(!result||result.replayed||!result.messageId||!result.clientUid)return;
  const recipients=isMasterActor(actor)||actor.profile?.role==='master_admin'?[result.clientUid]:await supportMasterUids(env);
  await sendUserPush(env,recipients,{id:`support:${result.messageId}`,title:"Bank Setu Support",body:isMasterActor(actor)||actor.profile?.role==='master_admin'?"You have a new reply from Bank Setu Support.":"A client sent a new support message.",category:"support",page:"support"},actor.uid);
}

export async function handleSyncPushEvent(request,env,actor) {
  const role=String(actor.profile?.role||"").toLowerCase(),tenantId=String(actor.profile?.tenantId||"");
  if(!["client_admin","client_user"].includes(role)||!tenantId)return json({error:"A verified client workspace is required."},403);
  const body=await request.json().catch(()=>({})),eventId=String(body.eventId||""),action=String(body.action||"");
  if(!/^[a-f0-9-]{36}$/i.test(eventId)||!["saveCustomer","updateCustomer","deleteCustomer"].includes(action))return json({error:"Invalid sync notification."},400);
  const now=Date.now(),stateId=await pushEventId("sync-state",tenantId),state=await licenseDoc(env,"/pushSyncSignals/"+stateId),current=licenseFields(state);
  if(Number(current.lastNotifiedAt||0)>now-SYNC_PUSH_COOLDOWN_MS)return json({success:true,suppressed:true});
  const event={id:"sync:"+Math.floor(now/SYNC_PUSH_COOLDOWN_MS),title:"New customer data available",body:"Customer changes from another device are ready to sync.",category:"sync",page:"sync-backup"};
  const job=await preparePushJob(env,tenantId,event);
  if(!job)return json({success:true,queued:false});
  const queueId=await pushEventId(tenantId,event.id);
  try{
    await licenseCommit(env,[
      licenseWrite(env,"pushSyncSignals",stateId,{tenantId,lastNotifiedAt:now,updatedAt:new Date(now).toISOString()},state?{updateTime:state.updateTime}:{exists:false}),
      licenseWrite(env,"pendingPushEvents",queueId,job,{exists:false}),
    ]);
  }catch(error){if(![409,412].includes(error.status))throw error;return json({success:true,suppressed:true});}
  await drainQueuedPush(env,tenantId,queueId);
  return json({success:true,queued:true});
}

const LICENSE_INQUIRY_EMAIL = "banksetu2026@gmail.com";

async function deliverLicenseInquiryEmail(env, notificationId) {
  if (!/^[a-f0-9-]{36}$/i.test(String(notificationId || "")) || !env.BANKSETU_APPS_SCRIPT_URL) return;
  let document = await licenseDoc(env, `/licenseNotificationOutbox/${notificationId}`);
  if (!document) return;
  let record = licenseFields(document), now = Date.now();
  if (record.status === "sent" || record.status === "cancelled") return;
  if (record.status === "sending" && Number(record.leaseUntil || 0) > now) return;
  if (Number(record.nextAttemptAt || 0) > now) return;
  try {
    await licenseCommit(env, [licenseWrite(env, "licenseNotificationOutbox", notificationId, {
      ...record, status: "sending", leaseUntil: now + 60_000, attempts: Number(record.attempts || 0) + 1, updatedAt: new Date(now).toISOString(),
    }, { updateTime: document.updateTime })]);
  } catch (error) { if ([409, 412].includes(error.status)) return; throw error; }
  document = await licenseDoc(env, `/licenseNotificationOutbox/${notificationId}`);
  record = licenseFields(document);
  if (!document || record.status !== "sending") return;
  try {
    const response = await fetch(env.BANKSETU_APPS_SCRIPT_URL, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ action: "notifyLicenseInquiry", notificationId, accessToken: await serviceAccessToken(env) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) throw new Error(result.message || "Inquiry email service did not confirm delivery.");
    const latest = await licenseDoc(env, `/licenseNotificationOutbox/${notificationId}`);
    if (licenseFields(latest).status !== "sent") throw new Error("Inquiry email delivery was not recorded.");
    const inquiry=await licenseDoc(env,`/licenseRequests/${notificationId}`),inquiryFields=licenseFields(inquiry);
    if(inquiry&&inquiryFields.kind==="inquiry"&&inquiryFields.status==="pending")await licenseCommit(env,[licenseWrite(env,"licenseRequests",notificationId,{...inquiryFields,notificationStatus:"sent",notificationError:"",notificationSentAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{updateTime:inquiry.updateTime})]).catch(()=>undefined);
  } catch (error) {
    const latest = await licenseDoc(env, `/licenseNotificationOutbox/${notificationId}`).catch(() => null), current = licenseFields(latest);
    const errorMessage=String(error instanceof Error ? error.message : "Email delivery failed").slice(0,240);
    if (latest && current.status !== "sent") {
      const delay = Math.min(6 * 60 * 60_000, 60_000 * Math.pow(2, Math.min(8, Number(current.attempts || 1) - 1)));
      await licenseCommit(env, [licenseWrite(env, "licenseNotificationOutbox", notificationId, {
        ...current, status: "pending", leaseUntil: 0, nextAttemptAt: Date.now() + delay,
        lastError: errorMessage, updatedAt: new Date().toISOString(),
      }, { updateTime: latest.updateTime })]).catch(() => undefined);
    }
    const inquiry=await licenseDoc(env,`/licenseRequests/${notificationId}`).catch(()=>null),inquiryFields=licenseFields(inquiry);
    if(inquiry&&inquiryFields.kind==="inquiry"&&inquiryFields.status==="pending")await licenseCommit(env,[licenseWrite(env,"licenseRequests",notificationId,{...inquiryFields,notificationStatus:"retry_pending",notificationError:errorMessage,updatedAt:new Date().toISOString()},{updateTime:inquiry.updateTime})]).catch(()=>undefined);
    console.warn("Bank Setu inquiry email queued for retry", error instanceof Error ? error.message : "unknown");
  }
}

async function drainLicenseInquiryEmails(env) {
  // Query only live jobs so an ever-growing history of sent notifications can
  // never crowd a pending inquiry out of the cron batch.
  const rows = await firestoreRequest(env, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "licenseNotificationOutbox" }],
    where: { fieldFilter: { field: { fieldPath: "active" }, op: "EQUAL", value: { booleanValue: true } } },
    limit: 50,
  } }) }).catch(() => []);
  const now = Date.now();
  const candidate = rows.map(row => row.document).filter(Boolean).find(document => {
    const item = licenseFields(document);
    return item.kind === "license_inquiry" && item.status !== "sent" && item.status !== "cancelled"
      && Number(item.nextAttemptAt || 0) <= now && (item.status !== "sending" || Number(item.leaseUntil || 0) <= now);
  });
  if (candidate) await deliverLicenseInquiryEmail(env, candidate.name.split("/").pop());
}

export async function deliverScheduledNotices(env) {
  // Resume one license per tick. Never scan every tenant in one Free invocation.
  const state = await licenseDoc(env, "/appSettings/pushSweep"), sweep = licenseFields(state);
  const pageToken = String(sweep.pageToken || "");
  let listing;
  try{listing=await firestoreRequest(env,"/tenantLicenses?pageSize=1"+(pageToken?"&pageToken="+encodeURIComponent(pageToken):""));}
  catch(error){if(!pageToken||error.status!==400)throw error;listing=await firestoreRequest(env,"/tenantLicenses?pageSize=1");}
  let latest = "";
  try { const response = await fetch("https://banksetu-app.web.app/version.json",{signal:AbortSignal.timeout(5000)});if(response.ok){const value=await response.json();latest=String(value.androidVersion||value.version||"");} }catch{/* License events do not depend on update metadata. */}
  let masterUpdateVersion=String(sweep.masterUpdateVersion||"");
  if(/^\d+\.\d+\.\d+$/.test(latest)&&latest!==masterUpdateVersion){
    const masters=await supportMasterUids(env);
    if(masters.length){await sendUserPush(env,masters,{id:"master-update:"+latest,title:"Bank Setu software update",body:"Version "+latest+" is available. Open Bank Setu to check for updates.",category:"update",page:"dashboard"});masterUpdateVersion=latest;}
  }
  for (const doc of listing.documents || []) {
    const license = licenseFields(doc), tenantId = license.tenantId;
    if (!tenantId) continue;
    let view;try{view=licenseView(license,Date.now(),0);}catch{continue;}
    if (["revoked","pending"].includes(view.state)) continue;
    const events = [];
    if(["expired","demo_expired","expiring_soon"].includes(view.state))events.push({id:license.revision+":"+view.state,title:view.state.includes("expired")?"Bank Setu license expired":"Bank Setu license expiring",body:"Open Bank Setu to review your license and renewal options."});
    if(["active","demo_active","expiring_soon"].includes(view.state)&&Date.parse(license.activatedAt||"")<=Date.now()&&(license.status==="scheduled"||Date.parse(license.activatedAt||"")>Date.parse(license.createdAt||license.updatedAt||"")))events.push({id:license.revision+":started",title:"Bank Setu license active",body:"Your scheduled license is now active. Open Bank Setu for details."});
    if(/^\d+\.\d+\.\d+$/.test(latest))events.push({id:"update:"+latest,title:"Bank Setu software update",body:"Version "+latest+" is available. Open Bank Setu to check for updates.",category:"update",page:"dashboard"});
    for (const event of events) {
      const id = await pushEventId(tenantId,event.id);
      if (await licenseDoc(env,"/pushEventClaims/"+id)) continue;
      const at = new Date().toISOString(), job = await preparePushJob(env,tenantId,event);
      const writes = [licenseWrite(env,"pushEventClaims",id,{tenantId,eventId:event.id,at,expiresAt:new Date(Date.now()+PUSH_RETENTION_MS)},{exists:false})];
      if(event.category!=="update")writes.push(licenseWrite(env,"licenseAudit",id,{tenantId,action:view.state.includes("expired")?"expired":view.state==="expiring_soon"?"expiry_warning":"activated",actorUid:"system",at,plan:license.plan},{exists:false}));
      if(job)writes.push(licenseWrite(env,"pendingPushEvents",id,job,{exists:false}));
      try{await licenseCommit(env,writes);}catch(error){if(![409,412].includes(error.status))throw error;}
      break; // At most one new event per tick; unclaimed events remain discoverable.
    }
  }
  await licenseCommit(env,[licenseWrite(env,"appSettings","pushSweep",{pageToken:listing.nextPageToken||"",masterUpdateVersion,updatedAt:new Date().toISOString()},state?{updateTime:state.updateTime}:{exists:false})]);
}

async function purgeExpiredPushDevices(env) {
  const rows = await firestoreRequest(env, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "pushDevices" }],
    where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN_OR_EQUAL", value: { timestampValue: new Date().toISOString() } } }, limit: 2,
  } }) });
  for (const row of rows) {
    const id = row.document?.name?.split('/').pop();
    if (id && pushDevicePattern.test(id)) await firestoreRequest(env, `/pushDevices/${id}`, { method: "DELETE" });
  }
}

export async function purgeExpiredPushArtifacts(env) {
  // Bounded cleanup keeps the free-tier database small without ever scanning
  // or touching customer/sync collections.
  const now={timestampValue:new Date().toISOString()};
  for(const collectionId of ["pendingPushEvents","pushEventClaims"]){
    const rows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{
      from:[{collectionId}],where:{fieldFilter:{field:{fieldPath:"expiresAt"},op:"LESS_THAN_OR_EQUAL",value:now}},limit:2
    }})}).catch(()=>[]);
    const writes=rows.map(row=>row.document).filter(Boolean).map(document=>({delete:document.name,currentDocument:{updateTime:document.updateTime}}));
    if(writes.length)await licenseCommit(env,writes);
  }
}

async function purgeTenantPushDevices(env, tenantId) {
  for (let page = 0; page < 20; page++) {
    const rows = await firestoreRequest(env, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "pushDevices" }],
      where: { fieldFilter: { field: { fieldPath: "tenantId" }, op: "EQUAL", value: { stringValue: tenantId } } }, limit: 100,
    } }) });
    const matches = rows.filter(row => decodeFields(row.document?.fields || {}).tenantId === tenantId);
    if (!matches.length) return;
    for (const row of matches) {
      const id = row.document?.name?.split('/').pop();
      if (id && pushDevicePattern.test(id)) await firestoreRequest(env, `/pushDevices/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
  }
  throw new Error("Push registration cleanup is incomplete; the workspace remains blocked for retry.");
}

async function getGoogleSetupConfig(env, actor) {
  const configResult = await firestoreRequest(env, "/appSettings/googleSetup").catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  const config = decodeFields(configResult?.fields || {});
  const role = String(actor.profile.role || "").toLowerCase();
  let settings = {};
  let workspaceOwnerUid = "";
  let workspaceStatus = "";
  if (["client_admin", "client_user"].includes(role) && actor.profile.tenantId) {
    const tenantResult = await firestoreRequest(env, `/tenantSettings/${encodeURIComponent(actor.profile.tenantId)}`).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    settings = decodeFields(tenantResult?.fields || {});
    const tenantDoc = await firestoreRequest(env, `/tenants/${encodeURIComponent(actor.profile.tenantId)}`).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    const tenantData = decodeFields(tenantDoc?.fields || {});
    workspaceOwnerUid = String(tenantData.ownerUid || "");
    workspaceStatus = String(tenantData.status || "unavailable");
  }
  const info = settings.bankInfo || {};
  const workspaceVerified = Boolean(workspaceOwnerUid && settings.workspaceOwnerUid === workspaceOwnerUid);
  const apiUrl = String(config.apiUrl || settings.apiUrl || env.BANKSETU_APPS_SCRIPT_URL || "");
  const oauthClientId = String(config.oauthClientId || env.BANKSETU_GOOGLE_OAUTH_CLIENT_ID || "");
  const executorEmail = String(config.executorEmail || env.BANKSETU_APPS_SCRIPT_EXECUTOR_EMAIL || "");
  let masterLocalReady=false;let masterConnectionId="";
  let dataApiReady = false;
  if (apiUrl) {
    try {
      const statusResponse = await fetch(`${apiUrl}?action=status`, { signal: AbortSignal.timeout(8000) });
      const status = await statusResponse.json();
      dataApiReady = statusResponse.ok && status.success === true && status.tenantIsolationVersion === "v2";
      masterLocalReady=isMasterActor(actor)&&dataApiReady&&status.masterLocalSyncVersion==="master-v1"&&/^master-[a-f0-9]{64}$/.test(status.masterConnectionId||"");
      if(masterLocalReady)masterConnectionId=status.masterConnectionId;
    } catch { /* Customer data stays locked until the isolated script version responds. */ }
  }
  if (settings.connectionMode === "option-b") {
    dataApiReady = false;
    if (settings.bridgeUrl) {
      try {
        const reply = await fetch(`${settings.bridgeUrl}?action=status`, { signal: AbortSignal.timeout(8000) });
        const status = await reply.json();
        dataApiReady = reply.ok && status.tenantIsolationVersion === "v3" && status.tenantId === actor.profile.tenantId && status.spreadsheetId === settings.spreadsheetId && status.photoFolderId === settings.photoFolderId;
      } catch { /* Leave writes locked until the client-owned bridge is ready. */ }
    }
  }
  return json({
    masterLocalReady,masterConnectionId,
    connectionMode: String(settings.connectionMode || "oauth"),
    serviceAccountEmail: "bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com",
    connectionId: String(settings.connectionId || settings.spreadsheetId || ""),
    oauthClientId,
    apiUrl: settings.connectionMode === "option-b" ? String(settings.bridgeUrl || "") : apiUrl,
    executorEmail,
    dataApiReady,
    tenantId: String(actor.profile.tenantId || ""),
    workspaceStatus: actor.workspaceStatus || workspaceStatus || "active",
    bankName: String(settings.bankName || ""),
    bankInfo: {
      passbookBank: String(settings.passbookBank || info.passbookBank || ""),
      branchName: String(settings.branchName || info.branchName || ""),
      cspCode: String(settings.cspCode || info.cspCode || ""),
      operatorName: String(settings.operatorName || info.operatorName || ""),
      address: String(settings.address || info.address || ""),
      mobile: String(settings.mobile || info.mobile || ""),
      branchAddress: String(settings.branchAddress || info.branchAddress || ""),
      branchPostOffice: String(settings.branchPostOffice || info.branchPostOffice || ""),
      branchDistrict: String(settings.branchDistrict || info.branchDistrict || ""),
      branchState: String(settings.branchState || info.branchState || ""),
      branchPinCode: String(settings.branchPinCode || info.branchPinCode || ""),
      branchEmail: String(settings.branchEmail || info.branchEmail || ""),
      branchPhone: String(settings.branchPhone || info.branchPhone || ""),
      ifsc: String(settings.ifsc || info.ifsc || ""),
      micr: String(settings.micr || info.micr || ""),
      branchCode: String(settings.branchCode || info.branchCode || ""),
      gstin: String(settings.gstin || info.gstin || ""),
      ckyc: String(settings.ckyc || info.ckyc || ""),
    },
    spreadsheetId: workspaceVerified ? String(settings.spreadsheetId || "") : "",
    photoFolderId: workspaceVerified ? String(settings.photoFolderId || "") : "",
    hasWorkspace: workspaceVerified && Boolean(settings.spreadsheetId && settings.photoFolderId),
    googleEmail: String(settings.googleEmail || ""),
    bankFormats: settings.bankFormats || {},
  });
}

async function createFirebaseAccount(env, email, password, displayName) {
  const token = await serviceAccessToken(env);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.localId) {
    const error = new Error(result.error?.message || "Could not create the Firebase account.");
    error.status = response.status;
    throw error;
  }
  return result.localId;
}

async function licenseDoc(env, path) {
  try { return await firestoreRequest(env, path); }
  catch (error) { if (error.status === 404) return null; throw error; }
}
function licenseFields(document) { return decodeFields(document?.fields || {}); }
function licenseName(env, collection, id) { return firestoreDocumentName(env, `/${collection}/${encodeURIComponent(id)}`); }
function licenseWrite(env, collection, id, fields, precondition = { exists: false }) {
  return { update: { name: licenseName(env, collection, id), fields: encodeFields(fields) }, currentDocument: precondition };
}
function licenseDelete(env, collection, id, precondition) {
  return { delete: licenseName(env, collection, id), ...(precondition ? { currentDocument: precondition } : {}) };
}
async function licenseCommit(env, writes) {
  return firestoreRequest(env, ":commit", { method: "POST", body: JSON.stringify({ writes }) });
}
async function licenseSettings(env) {
  const document = await licenseDoc(env, "/appSettings/licensing");
  const data = licenseFields(document);
  return { flags: { ...DEFAULT_FLAGS, ...data.flags }, pricing: { ...DEFAULT_PRICING, ...data.pricing }, paymentDetails:{...DEFAULT_PAYMENT_DETAILS,...data.paymentDetails}, document };
}
function licenseTenant(actor) {
  const tenantId = String(actor.profile?.tenantId || "");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)) throw new Error("A verified tenant is required.");
  return tenantId;
}
function licenseStartDate(value) {
  if(value === undefined || value === "")return undefined;
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  // A selected India calendar date of today means activation now. Returning
  // midnight would be interpreted as a past instant later in the same day.
  if(value===new Date(Date.now()+330*60_000).toISOString().slice(0,10))return undefined;
  return new Date(`${value}T00:00:00+05:30`).toISOString();
}
async function handleLicensing(request, env, actor, route, context) {
  const settings = await licenseSettings(env);
  const master = actor && isMasterActor(actor);
  if (route === "/license-public") return json({ pricing: settings.pricing, uiEnabled: settings.flags.uiEnabled, turnstileSiteKey: String(env.LICENSE_TURNSTILE_SITE_KEY || "") });
  if (route === "/license-inquiry") {
    if (!env.LICENSE_TURNSTILE_SECRET || !env.LICENSE_TURNSTILE_SITE_KEY) return json({ error: "License inquiries are temporarily unavailable. Please try again later." }, 503);
    if (Number(request.headers.get("content-length") || 0) > 4096) return json({ error: "Request is too large." }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request is too large." }, 413);
    const body = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
    const inquiry = validateInquiry(body);
    const challenge = String(body.turnstileToken || "");
    if (!challenge || challenge.length > 2048) return json({ error: "Complete the verification challenge." }, 400);
    const challengeResult = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret: env.LICENSE_TURNSTILE_SECRET, response: challenge, remoteip: request.headers.get("CF-Connecting-IP") || "", idempotency_key: inquiry.requestId }),
    }).then(response => response.json());
    if (!challengeResult.success || challengeResult.hostname !== "banksetu-app.web.app") return json({ error: "Verification failed. Please retry." }, 403);
    const id = inquiry.requestId;
    const existing = await licenseDoc(env, `/licenseRequests/${id}`);
    if (existing) return json({ success: true });
    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (!ip) return json({ error: "Request verification is unavailable." }, 503);
    const rateKey = await crypto.subtle.importKey("raw", encoder.encode(env.LICENSE_TURNSTILE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = async value => b64url(new Uint8Array(await crypto.subtle.sign("HMAC", rateKey, encoder.encode(value))));
    const rateIds = await Promise.all([digest(`ip:${ip}`), digest(`phone:${inquiry.mobile.replace(/\D/g, "")}`)]);
    const rateDocs = await Promise.all(rateIds.map(key => licenseDoc(env, `/licenseRequestLimits/${key}`)));
    const nowMs = Date.now();
    if (rateDocs.some(doc => nowMs - Number(licenseFields(doc).lastRequestMs || 0) < 15 * 60_000)) return json({ error: "Please wait 15 minutes before sending another request." }, 429);
    const now = new Date(nowMs).toISOString();
    const requestRecord = { ...inquiry, requestedPlan: inquiry.plan, kind: "inquiry", onboardingStage: "client_creation_required", status: "pending", paymentStatus: "not_paid", notificationStatus:"pending", notificationError:"", createdAt: now, updatedAt: now, quotedPaise: null, quoteRequiresConfirmation: true };
    const writes = [
      licenseWrite(env, "licenseRequests", id, requestRecord),
      licenseWrite(env, "licenseNotificationOutbox", id, {
        kind: "license_inquiry", requestId: id, recipient: LICENSE_INQUIRY_EMAIL, status: "pending", attempts: 0,
        active: true, leaseUntil: 0, nextAttemptAt: nowMs, createdAt: now, updatedAt: now,
      }, { exists: false }),
    ];
    rateIds.forEach((key, index) => writes.push(licenseWrite(env, "licenseRequestLimits", key, { lastRequestMs: nowMs }, rateDocs[index] ? { updateTime: rateDocs[index].updateTime } : { exists: false })));
    try { await licenseCommit(env, writes); }
    catch (error) { if (error.status === 409) return json({ error: "Another request was just received. Please wait before retrying." }, 429); throw error; }
    context?.waitUntil(deliverLicenseInquiryEmail(env, id));
    return json({ success: true });
  }
  if (!actor) return json({ error: "Sign in is required." }, 401);
  if(route==="/license-my-requests"){
    if(master||String(actor.profile.role).toLowerCase()!=="client_admin")return json({error:"Client Admin access is required."},403);
    const tenantId=licenseTenant(actor);
    const rows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:"licenseRequests"}],where:{fieldFilter:{field:{fieldPath:"tenantId"},op:"EQUAL",value:{stringValue:tenantId}}},limit:50}})});
    return json({requests:rows.map(row=>licenseFields(row.document)).filter(item=>item.tenantId===tenantId).map(item=>({id:item.id,kind:item.kind,requestedPlan:item.requestedPlan,status:item.status,paymentStatus:item.paymentStatus,createdAt:item.createdAt}))});
  }
  if (route === "/license-admin-settings") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    return json({ pricing: settings.pricing, paymentDetails:settings.paymentDetails, flags: settings.flags });
  }
  if (route === "/license-save-settings") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body = await request.json().catch(() => ({}));
    const pricing = validatePricing(body.pricing);
    const paymentDetails=body.paymentDetails===undefined?settings.paymentDetails:validatePaymentDetails(body.paymentDetails);
    // Enabling enforcement requires a separately verified migration. This route
    // deliberately cannot activate it or reinterpret legacy missing records.
    if (body.uiEnabled === true && (!env.LICENSE_TURNSTILE_SECRET || !env.LICENSE_TURNSTILE_SITE_KEY)) return json({ error: "Configure both Cloudflare Turnstile keys before enabling public onboarding." }, 409);
    const flags = { ...settings.flags, uiEnabled: body.uiEnabled === true, newClientRequired: body.newClientRequired === undefined ? settings.flags.newClientRequired : body.newClientRequired === true };
    const now = new Date().toISOString();
    const prev = settings.document?.updateTime ? { updateTime: settings.document.updateTime } : { exists: false };
    await licenseCommit(env, [
      licenseWrite(env, "appSettings", "licensing", { pricing, paymentDetails, flags, updatedAt: now, updatedBy: actor.uid }, prev),
      licenseWrite(env, "licenseAudit", crypto.randomUUID(), { action: "pricing_updated", actorUid: actor.uid, before: settings.pricing, after: pricing, at: now }),
    ]);
    return json({ success: true, pricing, paymentDetails, flags });
  }
  if (route === "/license-admin-inquiry-status") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const rows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{
      from:[{collectionId:"licenseRequests"}],
      where:{fieldFilter:{field:{fieldPath:"status"},op:"EQUAL",value:{stringValue:"pending"}}},limit:51,
    }})});
    const pending=rows.filter(row=>row.document).map(row=>({...licenseFields(row.document),id:row.document.name.split("/").at(-1)})).filter(item=>item.kind==="inquiry").sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    return json({count:pending.length,truncated:pending.length>50,latest:pending.slice(0,5).map(item=>({id:item.id,name:item.name||item.clientName||"Applicant",bankName:item.bankName||"",requestedPlan:item.requestedPlan||item.plan||"",createdAt:item.createdAt||""})),checkedAt:new Date().toISOString()});
  }
  if (route === "/license-admin-list") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const query = async collection => {
      const records = [];
      let pageToken = "";
      for (let page = 0; page < 20; page++) {
        const result = await firestoreRequest(env, `/${collection}?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
        records.push(...(result.documents || []).map(doc => ({ ...licenseFields(doc), id: doc.name.split("/").at(-1) })));
        pageToken = result.nextPageToken || "";
        if (!pageToken) break;
      }
      return { records, truncated: Boolean(pageToken) };
    };
    const [requestPage, licensePage, tenantPage, ownerPage] = await Promise.all([query("licenseRequests"), query("tenantLicenses"), query("tenants"),query("users")]);
    const currentTenants=currentTenantRecords(tenantPage.records);
    const owners=new Map(ownerPage.records.filter(item=>item.role==="client_admin" && item.tenantId).map(item=>[item.tenantId,item]));
    const tenantNames=new Map(currentTenants.map(item=>[item.tenantId||item.id,item.bankName||""]));
    const licenses = licensePage.records.filter(item=>tenantNames.has(item.tenantId)).map(item=>({...item,bankName:tenantNames.get(item.tenantId)||"",viewState:(()=>{try{return licenseView(item,Date.now(),settings.pricing.graceDays).state;}catch{return "pending";}})()}));
    const requests=requestPage.records.filter(item=>!item.tenantId||tenantNames.has(item.tenantId)).map(item=>({...item,bankName:item.bankName||tenantNames.get(item.tenantId)||"",clientName:item.clientName||item.name||"",notificationStatus:item.notificationStatus||"unknown",notificationError:item.notificationError||""}));
    const stateCount = state => licenses.filter(item => {
      try { return licenseView(item, Date.now(), settings.pricing.graceDays).state === state; }
      catch { return false; }
    }).length;
    return json({ requests, licenses, serverTime:new Date().toISOString(),
      tenants: currentTenants.map(item => {const owner=owners.get(item.tenantId||item.id);return { ownerUid:item.ownerUid||owner?.id||"",phone:item.phone||owner?.phone||owner?.mobile||"",remarks:item.remarks||"",tenantId: item.tenantId || item.id, name:item.name||owner?.name||"", email:item.email||owner?.email||"", bankName: item.bankName || "", createdAt:item.createdAt||owner?.createdAt||"" };}),
      summary: { total: currentTenants.length, active: stateCount("active") + stateCount("expiring_soon") + stateCount("demo_active"), soon: stateCount("expiring_soon") + stateCount("demo_active"), expired: stateCount("expired")+stateCount("demo_expired"), scheduled:stateCount("scheduled"), suspended:stateCount("suspended")+stateCount("revoked"), demo:licenses.filter(item=>item.plan==="demo").length, pending: requests.filter(item => item.status === "pending").length, pendingClients:currentTenants.filter(tenant=>!licenses.some(item=>item.tenantId===(tenant.tenantId||tenant.id))).length+stateCount("pending") },
      truncated: requestPage.truncated || licensePage.truncated || tenantPage.truncated || ownerPage.truncated });
  }
  if (route === "/license-admin-history") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body=await request.json().catch(()=>({}));
    const cursor=body.cursor;
    if(cursor && (typeof cursor.at!=="string"||!/^[0-9TZ:.+-]{20,40}$/.test(cursor.at)||typeof cursor.name!=="string"||!cursor.name.startsWith(`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/licenseAudit/`)||cursor.name.length>320))
      return json({error:"Invalid activity cursor."},400);
    const rows = await firestoreRequest(env, ":runQuery", {
      method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "licenseAudit" }], orderBy: [{ field: { fieldPath: "at" }, direction: "DESCENDING" },{field:{fieldPath:"__name__"},direction:"DESCENDING"}],...(cursor?{startAt:{values:[{stringValue:cursor.at},{referenceValue:cursor.name}],before:false}}:{}), limit: 51 } }),
    });
    const documents=rows.filter(row=>row.document).map(row=>row.document);
    const page=documents.slice(0,50);
    const last=page.at(-1);
    return json({ activities:page.map(doc=>({...licenseFields(doc),id:doc.name.split('/').at(-1)})),nextCursor:documents.length>50&&last?{at:String(licenseFields(last).at||""),name:last.name}:null });
  }
  if (route === "/license-me") {
    if (master) return json({ master: true, pricing: settings.pricing, flags: settings.flags });
    const tenantId = licenseTenant(actor);
    const license = licenseFields(await licenseDoc(env, `/tenantLicenses/${encodeURIComponent(tenantId)}`));
    const found = Boolean(license.tenantId);
    if (found && license.tenantId !== tenantId) return json({error:"License tenant mismatch."},403);
    const view = licenseView(found ? license : {status:"pending"}, Date.now(), settings.pricing.graceDays);
    const serverTime = Date.now();
    let receipt = null;
    if (found && view.canWrite) {
      const expiry = ["annual","demo"].includes(license.plan) ? Date.parse(license.expiresAt) : Infinity;
      const validUntil = Math.min(serverTime + 24 * 60 * 60 * 1000, expiry);
      const signed = await createOfflineSession(env.FIREBASE_SERVICE_ACCOUNT, { purpose: "banksetu-license-v1", uid: actor.uid, tenantId, revision: license.revision, state: view.state, issuedAt: serverTime, validUntil, expiresAt: license.expiresAt, plan: license.plan });
      receipt = { payload: signed.payload, signature: signed.signature };
    }
    const statusExpiry=found&&view.canWrite&&["annual","demo"].includes(license.plan)?Date.parse(license.expiresAt):Infinity;
    const signedStatus = await createOfflineSession(env.FIREBASE_SERVICE_ACCOUNT, {purpose:"banksetu-license-status-v1",uid:actor.uid,tenantId,revision:found?license.revision:0,state:view.state,canWrite:view.canWrite,plan:found?license.plan:null,expiresAt:found?license.expiresAt:null,issuedAt:serverTime,validUntil:Math.min(serverTime+24*60*60*1000,statusExpiry)});
    return json({ uid:actor.uid,tenantId,license: found ? license : null, view, receipt, authorization:{payload:signedStatus.payload,signature:signedStatus.signature}, pricing: settings.pricing, paymentDetails:settings.paymentDetails, flags: settings.flags, serverTime: new Date(serverTime).toISOString(), legacyAccess:false });
  }
  if (route === "/license-request-change") {
    if (master || String(actor.profile.role).toLowerCase() !== "client_admin") return json({ error: "Only the Client Admin can request a license change." }, 403);
    const tenantId = licenseTenant(actor);
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    const id = String(body.requestId || "");
    const transactionId=String(body.transactionId||"").trim().toUpperCase();
    const paymentDate=String(body.paymentDate||"").trim();
    const claimedPaise=body.paidPaise===undefined?null:Number(body.paidPaise);
    if (!/^[a-f0-9-]{36}$/.test(id) || !["renewal", "upgrade"].includes(kind)) return json({ error: "Invalid request." }, 400);
    if(transactionId && !/^[A-Z0-9/_-]{6,64}$/.test(transactionId) || paymentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||!Number.isFinite(Date.parse(paymentDate))) || claimedPaise!==null && (!Number.isSafeInteger(claimedPaise)||claimedPaise<0||claimedPaise>100_000_000))return json({error:"Enter valid payment date, amount and transaction reference."},400);
    const license = licenseFields(await licenseDoc(env, `/tenantLicenses/${tenantId}`));
    if (!["annual", "demo"].includes(license.plan) || license.status === "revoked") return json({ error: "An Annual or Demo license is required." }, 409);
    const requestedPlan = String(body.plan || (kind === "renewal" ? "annual" : "lifetime"));
    if (kind === "renewal" && (license.plan !== "annual" || requestedPlan !== "annual") || kind === "upgrade" && !["annual", "lifetime"].includes(requestedPlan) || kind === "upgrade" && license.plan === "annual" && requestedPlan !== "lifetime") return json({error:"Invalid plan transition."},400);
    if (await licenseDoc(env, `/licenseRequests/${id}`)) return json({ success: true, referenceId: id });
    const pendingRows=await firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:"licenseRequests"}],where:{fieldFilter:{field:{fieldPath:"tenantId"},op:"EQUAL",value:{stringValue:tenantId}}},limit:25}})});
    const pending=pendingRows.map(row=>licenseFields(row.document)).find(item=>item.status==="pending" && item.kind===kind && (item.requestedPlan||"lifetime")===requestedPlan);
    if(pending)return json({success:true,referenceId:pending.id,alreadyPending:true});
    const quote = kind === "renewal" ? settings.pricing.annualPaise : requestedPlan === "annual" ? settings.pricing.annualPaise : upgradeAmount(settings.pricing, license).duePaise;
    if(!settings.pricing[requestedPlan === "annual" ? "annualAvailable" : "lifetimeAvailable"])return json({error:"Requested plan is unavailable."},409);
    if (kind === "renewal" && !settings.pricing.annualAvailable) return json({ error: "Renewals are currently unavailable." }, 409);
    const now = new Date().toISOString();
    const tenant=licenseFields(await licenseDoc(env,`/tenants/${tenantId}`));
    const writes=[licenseWrite(env, "licenseRequests", id, { id, kind, requestedPlan, tenantId, requestedBy: actor.uid, clientName:String(actor.profile.name||""), email:actor.email, bankName:String(tenant.bankName||""), status: "pending", paymentStatus: transactionId?"client_reported":"not_paid",transactionId,paymentDate,claimedPaise, quotedPaise: quote, quoteRequiresConfirmation: true, pricingRevisionAt: settings.document?.updateTime || "", createdAt: now, updatedAt: now }, {exists:false})];
    if(transactionId){
      const digest=b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(transactionId))));
      writes.push(licenseWrite(env,"licensePaymentRefs",digest,{requestId:id,tenantId,createdAt:now},{exists:false}));
    }
    try{await licenseCommit(env,writes);}catch(error){if(error.status===409)return json({error:"This payment reference has already been submitted. Refresh the request status."},409);throw error;}
    return json({ success: true, referenceId: id, quotedPaise: quote });
  }
  if (route === "/license-admin-assign") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId || "");
    const plan = String(body.plan || "");
    const id = String(body.requestId || "");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) || !["annual", "lifetime"].includes(plan) || !/^[a-f0-9-]{36}$/.test(id) || body.paymentConfirmed !== true) return json({ error: "Select a tenant and plan, then confirm payment." }, 400);
    const startAt=licenseStartDate(body.startDate);
    if(startAt===null)return json({error:"Select a valid India activation date."},400);
    const durationMonths=body.durationMonths === undefined ? 12 : Number(body.durationMonths);
    if(plan==="annual"&&(!Number.isInteger(durationMonths)||durationMonths<1||durationMonths>120))return json({error:"Select a duration from 1 to 120 months."},400);
    const tenant = await licenseDoc(env, `/tenants/${tenantId}`);
    if (!tenant || licenseFields(tenant).status !== "active") return json({ error: "Active tenant not found." }, 409);
    const existing = await licenseDoc(env, `/tenantLicenses/${tenantId}`);
    if (existing) {
      const data = licenseFields(existing);
      if (data.lastRequestId === id) return json({ success: true, repeated: true });
      return json({ error: "Tenant already has a license. Use renewal or upgrade." }, 409);
    }
    const price = plan === "annual" ? settings.pricing.annualPaise : settings.pricing.lifetimePaise;
    if (!price || !settings.pricing[plan === "annual" ? "annualAvailable" : "lifetimeAvailable"]) return json({ error: "Plan is not available. Configure pricing first." }, 409);
    const paidPaise=body.paidPaise === undefined ? price : Number(body.paidPaise);
    if(!Number.isSafeInteger(paidPaise)||paidPaise<=0||paidPaise>100_000_000)return json({error:"Confirm a valid paid amount in paise."},400);
    const now = new Date().toISOString();
    const license = transitionLicense(null, { kind: plan, id, quotedPaise: paidPaise, startAt, durationMonths }, now, settings.pricing);
    license.tenantId = tenantId;
    license.graceDays = settings.pricing.graceDays;
    const writes = [
      licenseWrite(env, "tenantLicenses", tenantId, license),
      licenseWrite(env, "licenseAudit", id, { action: "assigned", requestId: id, tenantId, actorUid: actor.uid, at: now, plan, quotedPaise: price, paidPaise, activatedAt: license.activatedAt, expiresAt: license.expiresAt, durationMonths:license.durationMonths, paymentStatus: "payment_confirmed" }),
    ];
    const ownerUid = String(licenseFields(tenant).ownerUid || "");
    const ownerDoc = ownerUid ? await licenseDoc(env, `/users/${encodeURIComponent(ownerUid)}`) : null;
    const owner = licenseFields(ownerDoc);
    if (owner.licensingInvite === true && owner.tenantId === tenantId && owner.status === "pending") {
      writes.push(licenseWrite(env, "users", ownerUid, { ...owner, status: "approved", subscriptionStatus: "active", updatedAt: now, updatedBy: actor.uid }, { updateTime: ownerDoc.updateTime }));
    }
    try { await licenseCommit(env, writes); }
    catch (error) { if (error.status === 409) return json({ error: "License already assigned. Refresh before retrying." }, 409); throw error; }
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: "Bank Setu license updated", body: "Your license has been assigned. Open Bank Setu for details." }));
    return json({ success: true, tenantId, license });
  }
  if (route === "/license-admin-change") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId || ""), id = String(body.requestId || ""), kind = String(body.kind || "");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) || !/^[a-f0-9-]{36}$/.test(id) || !["renewal", "upgrade"].includes(kind) || body.paymentConfirmed !== true) return json({ error: "Select a valid license change and confirm payment." }, 400);
    const tenant = licenseFields(await licenseDoc(env, `/tenants/${tenantId}`));
    if (tenant.status !== "active") return json({ error: "Active tenant not found." }, 409);
    const doc = await licenseDoc(env, `/tenantLicenses/${tenantId}`), current = licenseFields(doc);
    if (!doc || ["suspended", "revoked"].includes(current.status)) return json({ error: "An unsuspended Annual license is required. Reactivate suspended licenses first." }, 409);
    if (current.lastRequestId === id) return json({ success: true, repeated: true });
    if (current.plan !== "annual") return json({ error: "An Annual license is required." }, 409);
    // Check the audit too: a successful upgrade has changed the current plan to Lifetime.
    const previous = await licenseDoc(env, `/licenseAudit/${id}`);
    if (previous) return json({ error: "This operation reference has already been used." }, 409);
    const price = kind === "renewal" ? settings.pricing.annualPaise : upgradeAmount(settings.pricing, current).duePaise;
    if (!settings.pricing[kind === "renewal" ? "annualAvailable" : "lifetimeAvailable"]) return json({ error: "Requested plan is unavailable." }, 409);
    const paidPaise = body.paidPaise === undefined ? price : Number(body.paidPaise);
    if (!Number.isSafeInteger(paidPaise) || paidPaise < 0 || paidPaise > 100_000_000 || (paidPaise === 0 && price !== 0)) return json({ error: "Confirm a valid paid amount." }, 400);
    const startAt = licenseStartDate(body.startDate), durationMonths = body.durationMonths === undefined ? 12 : Number(body.durationMonths);
    if (startAt === null || kind === "renewal" && (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120)) return json({ error: "Select a valid start date and duration." }, 400);
    const now = new Date().toISOString();
    const next = transitionLicense(current, { kind, id, quotedPaise: paidPaise, startAt, durationMonths }, now, settings.pricing);
    next.tenantId = tenantId; next.graceDays = settings.pricing.graceDays;
    try {
      await licenseCommit(env, [
        licenseWrite(env, "tenantLicenses", tenantId, next, { updateTime: doc.updateTime }),
        licenseWrite(env, "licenseAudit", id, { action: kind === "renewal" ? "renewed" : "upgraded", actorUid: actor.uid, tenantId, at: now, before: { plan: current.plan, status: current.status, expiresAt: current.expiresAt }, after: { plan: next.plan, status: next.status, expiresAt: next.expiresAt }, quotedPaise: price, paidPaise, paymentStatus: "payment_confirmed" }, { exists: false }),
      ]);
    } catch (error) { if (error.status === 409) return json({ error: "License changed. Refresh before retrying." }, 409); throw error; }
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: "Bank Setu license updated", body: "Your license was updated. Open Bank Setu for details." }));
    return json({ success: true, license: next });
  }
  if (route === "/license-admin-demo") {
    if(!master)return json({error:"Master Admin access is required."},403);
    const body=await request.json().catch(()=>({}));
    const tenantId=String(body.tenantId||""),id=String(body.requestId||"");
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)||!/^[a-f0-9-]{36}$/.test(id))return json({error:"Select a valid invited tenant."},400);
    const selectedStart=licenseStartDate(body.startDate);
    if(selectedStart===null||selectedStart&&(Date.parse(selectedStart)<Date.now()-60_000||Date.parse(selectedStart)>Date.now()+2*365*86400000))return json({error:"Select a valid Demo activation date."},400);
    const tenantDoc=await licenseDoc(env,`/tenants/${tenantId}`),tenant=licenseFields(tenantDoc);
    if(tenant.status!=="active")return json({error:"Active invited tenant not found."},409);
    const existing=await licenseDoc(env,`/tenantLicenses/${tenantId}`);
    if(existing){if(licenseFields(existing).lastRequestId===id)return json({success:true,repeated:true});return json({error:"A license or demo already exists for this tenant."},409);}
    const ownerUid=String(tenant.ownerUid||""),ownerDoc=ownerUid?await licenseDoc(env,`/users/${encodeURIComponent(ownerUid)}`):null,owner=licenseFields(ownerDoc);
    if(!ownerDoc||owner.tenantId!==tenantId||owner.role!=="client_admin")return json({error:"Demo requires an existing Client Admin tenant."},409);
    const nowMs=Date.now(),now=new Date(nowMs).toISOString(),activatedAt=selectedStart||now;
    const license={tenantId,plan:"demo",status:Date.parse(activatedAt)>nowMs?"scheduled":"active",demoOnly:false,activatedAt,expiresAt:new Date(Date.parse(activatedAt)+5*86400000).toISOString(),paidPaise:0,revision:1,updatedAt:now,lastRequestId:id};
    const writes=[licenseWrite(env,"tenantLicenses",tenantId,license),licenseWrite(env,"licenseAudit",id,{action:"demo_activated",actorUid:actor.uid,tenantId,at:now,expiresAt:license.expiresAt})];
    if(owner.status==="pending")writes.push(licenseWrite(env,"users",ownerUid,{...owner,status:"approved",subscriptionStatus:"active",updatedAt:now,updatedBy:actor.uid},{updateTime:ownerDoc.updateTime}));
    try{await licenseCommit(env,writes);}catch(error){if(error.status===409)return json({error:"Demo state changed. Refresh before retrying."},409);throw error;}
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: license.status==="scheduled"?"Bank Setu demo scheduled":"Bank Setu demo activated", body: license.status==="scheduled"?"Your five-day license is scheduled. Open Bank Setu for its start date.":"Your five-day license is ready. Complete your workspace setup in Bank Setu." }));
    return json({success:true,license});
  }
  if(route==="/license-admin-demo-convert"){
    if(!master)return json({error:"Master Admin access is required."},403);
    const body=await request.json().catch(()=>({}));const tenantId=String(body.tenantId||""),id=String(body.requestId||""),plan=String(body.plan||"");
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)||!/^[a-f0-9-]{36}$/.test(id)||!["annual","lifetime"].includes(plan)||body.paymentConfirmed!==true)return json({error:"Select the plan and confirm payment."},400);
    const doc=await licenseDoc(env,`/tenantLicenses/${tenantId}`),current=licenseFields(doc);
    if(current.lastRequestId===id)return json({success:true,repeated:true});
    if(current.plan!=="demo")return json({error:"This tenant has no demo to convert."},409);
    if(["suspended","revoked"].includes(current.status))return json({error:"Reactivate this tenant's Demo license before converting it."},409);
    const tenant=licenseFields(await licenseDoc(env,`/tenants/${tenantId}`));
    if(tenant.status!=="active")return json({error:"Active tenant not found."},409);
    const price=plan==="annual"?settings.pricing.annualPaise:settings.pricing.lifetimePaise;
    const paidPaise=body.paidPaise===undefined?price:Number(body.paidPaise);
    if(!settings.pricing[plan==="annual"?"annualAvailable":"lifetimeAvailable"]||!Number.isSafeInteger(paidPaise)||paidPaise<=0||paidPaise>100_000_000)return json({error:"Confirm an available paid plan and amount."},400);
    const now=new Date().toISOString();const startAt=licenseStartDate(body.startDate);
    if(startAt===null)return json({error:"Select a valid India activation date."},400);
    const durationMonths=body.durationMonths===undefined?12:Number(body.durationMonths);
    if(plan==="annual"&&(!Number.isInteger(durationMonths)||durationMonths<1||durationMonths>120))return json({error:"Select a valid paid duration."},400);
    const next=transitionLicense(null,{kind:plan,id,quotedPaise:paidPaise,startAt,durationMonths},now,settings.pricing);
    Object.assign(next,{tenantId,firstActivatedAt:current.firstActivatedAt||current.activatedAt||next.activatedAt,demoOnly:false,revision:Number(current.revision||0)+1});
    try{await licenseCommit(env,[licenseWrite(env,"tenantLicenses",tenantId,next,{updateTime:doc.updateTime}),licenseWrite(env,"licenseAudit",id,{action:"demo_converted",actorUid:actor.uid,tenantId,at:now,before:{plan:"demo",expiresAt:current.expiresAt},after:{plan,status:next.status,activatedAt:next.activatedAt,expiresAt:next.expiresAt},paidPaise})]);}
    catch(error){if(error.status===409)return json({error:"License changed. Refresh before retrying."},409);throw error;}
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: "Bank Setu license updated", body: "Your paid license was approved. Open Bank Setu for details." }));
    return json({success:true,license:next});
  }
  if (route === "/license-admin-email-retry") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body=await request.json().catch(()=>({})),id=String(body.requestId||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return json({error:"Invalid request ID."},400);
    const requestDoc=await licenseDoc(env,`/licenseRequests/${id}`),item=licenseFields(requestDoc);
    if(!requestDoc||item.kind!=="inquiry"||item.status!=="pending")return json({error:"Only a pending inquiry email can be retried."},409);
    const outbox=await licenseDoc(env,`/licenseNotificationOutbox/${id}`),current=licenseFields(outbox),now=new Date().toISOString();
    if(current.status==="sent")return json({success:true,status:"sent",repeated:true});
    await licenseCommit(env,[
      licenseWrite(env,"licenseNotificationOutbox",id,{
        ...current,kind:"license_inquiry",requestId:id,recipient:LICENSE_INQUIRY_EMAIL,status:"pending",active:true,
        attempts:Number(current.attempts||0),nextAttemptAt:0,leaseUntil:0,lastError:"",updatedAt:now,createdAt:current.createdAt||now,
      },outbox?{updateTime:outbox.updateTime}:{exists:false}),
      licenseWrite(env,"licenseRequests",id,{...item,notificationStatus:"pending",notificationError:"",updatedAt:now},{updateTime:requestDoc.updateTime}),
    ]);
    context?.waitUntil(deliverLicenseInquiryEmail(env,id));
    return json({success:true,status:"pending"});
  }
  if (route === "/license-admin-delete-request") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body=await request.json().catch(()=>({})),id=String(body.requestId||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return json({error:"Invalid request ID."},400);
    const requestDoc=await licenseDoc(env,`/licenseRequests/${id}`);
    if(!requestDoc)return json({success:true,repeated:true,deleted:0});
    const item=licenseFields(requestDoc);
    if(item.kind!=="inquiry"||item.status!=="rejected")return json({error:"Reject this inquiry before permanently deleting it."},409);
    const [outbox,auditRows]=await Promise.all([
      licenseDoc(env,`/licenseNotificationOutbox/${id}`),
      firestoreRequest(env,":runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:"licenseAudit"}],where:{fieldFilter:{field:{fieldPath:"requestId"},op:"EQUAL",value:{stringValue:id}}},limit:100}})}),
    ]);
    const writes=[licenseDelete(env,"licenseRequests",id,{updateTime:requestDoc.updateTime})];
    if(outbox)writes.push(licenseDelete(env,"licenseNotificationOutbox",id,{updateTime:outbox.updateTime}));
    for(const row of auditRows){if(row.document)writes.push({delete:row.document.name,currentDocument:{updateTime:row.document.updateTime}});}
    await licenseCommit(env,writes);
    return json({success:true,deleted:writes.length});
  }
  if (route === "/license-admin-decision") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body = await request.json().catch(() => ({}));
    const id = String(body.requestId || "");
    if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Invalid request ID." }, 400);
    const requestDoc = await licenseDoc(env, `/licenseRequests/${id}`);
    if (!requestDoc) return json({ error: "License request not found." }, 404);
    const item = licenseFields(requestDoc);
    if (item.status === "approved" || item.status === "rejected") return json({ success: true, status: item.status, repeated: true });
    if (item.status !== "pending") return json({ error: "Request is not pending." }, 409);
    const action = String(body.action || "");
    if (!["approve", "reject"].includes(action)) return json({ error: "Invalid decision." }, 400);
    if (item.kind === "inquiry") {
      const now = new Date().toISOString();
      if (action === "reject") {
        const outbox=await licenseDoc(env,`/licenseNotificationOutbox/${id}`),writes=[
          licenseWrite(env, "licenseRequests", id, { ...item, status: "rejected", onboardingStage: "rejected", paymentStatus: "rejected", decidedAt: now, decidedBy: actor.uid, updatedAt: now }, { updateTime: requestDoc.updateTime }),
          licenseWrite(env, "licenseAudit", crypto.randomUUID(), { action: "inquiry_rejected", requestId: id, tenantId: String(item.tenantId || ""), actorUid: actor.uid, at: now }),
        ];
        if(outbox){const notification=licenseFields(outbox);writes.push(licenseWrite(env,"licenseNotificationOutbox",id,{...notification,status:"cancelled",active:false,leaseUntil:0,nextAttemptAt:0,updatedAt:now},{updateTime:outbox.updateTime}));}
        await licenseCommit(env,writes);
        return json({ success: true, status: "rejected" });
      }
      const tenantId = String(item.tenantId || ""), clientUid = String(item.clientUid || "");
      const tenantDoc = /^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) ? await licenseDoc(env, `/tenants/${tenantId}`) : null;
      const clientDoc = clientUid ? await licenseDoc(env, `/users/${encodeURIComponent(clientUid)}`) : null;
      const tenant = licenseFields(tenantDoc), client = licenseFields(clientDoc);
      if (!tenantDoc || tenant.status !== "active" || tenant.ownerUid !== clientUid || !clientDoc || client.role !== "client_admin" || client.tenantId !== tenantId || String(client.email || "").toLowerCase() !== String(item.email || "").toLowerCase() || item.onboardingStage !== "client_created") return json({ error: "Create and link the Client Admin before approving this inquiry." }, 409);
      if (await licenseDoc(env, `/tenantLicenses/${tenantId}`)) return json({ error: "This client already has a license. Refresh License Management." }, 409);
      // Master Admin may choose a different final entitlement while reviewing
      // an inquiry; the submitted value remains preserved in the audit trail.
      const selectedPlan = String(body.plan || item.requestedPlan || item.plan || "");
      if (!["demo", "annual", "lifetime"].includes(selectedPlan)) return json({ error: "Select Demo, Annual or Lifetime before approval." }, 400);
      const startAt = licenseStartDate(body.startDate);
      if (startAt === null) return json({ error: "Select a valid India activation date." }, 400);
      const durationMonths = body.durationMonths === undefined ? 12 : Number(body.durationMonths);
      let license, paidPaise = 0;
      if (selectedPlan === "demo") {
        const activatedAt = startAt || now;
        license = { tenantId, plan: "demo", status: Date.parse(activatedAt) > Date.now() ? "scheduled" : "active", demoOnly: false, activatedAt, expiresAt: new Date(Date.parse(activatedAt) + 5 * 86400000).toISOString(), paidPaise: 0, revision: 1, updatedAt: now, lastRequestId: id };
      } else {
        if (body.paymentConfirmed !== true) return json({ error: "Master Admin must confirm payment before approval." }, 400);
        const configured = selectedPlan === "annual" ? settings.pricing.annualPaise : settings.pricing.lifetimePaise;
        if (!configured || !settings.pricing[selectedPlan === "annual" ? "annualAvailable" : "lifetimeAvailable"]) return json({ error: "The selected paid plan is not available." }, 409);
        paidPaise = body.paidPaise === undefined ? configured : Number(body.paidPaise);
        if (!Number.isSafeInteger(paidPaise) || paidPaise <= 0 || paidPaise > 100_000_000 || selectedPlan === "annual" && (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120)) return json({ error: "Confirm the paid amount and valid duration." }, 400);
        license = transitionLicense(null, { kind: selectedPlan, id, quotedPaise: paidPaise, startAt, durationMonths }, now, settings.pricing);
        license.tenantId = tenantId; license.graceDays = settings.pricing.graceDays;
      }
      const decided = { ...item, requestedPlan: selectedPlan, status: "approved", onboardingStage: "approved", paymentStatus: selectedPlan === "demo" ? "not_required" : "payment_confirmed", decidedAt: now, decidedBy: actor.uid, updatedAt: now, quotedPaise: selectedPlan === "demo" ? 0 : paidPaise };
      await licenseCommit(env, [
        licenseWrite(env, "licenseRequests", id, decided, { updateTime: requestDoc.updateTime }),
        licenseWrite(env, "tenantLicenses", tenantId, license, { exists: false }),
        licenseWrite(env, "licenseAudit", crypto.randomUUID(), { action: selectedPlan === "demo" ? "inquiry_demo_activated" : "inquiry_approved", requestId: id, tenantId, actorUid: actor.uid, at: now, plan: selectedPlan, paidPaise, activatedAt: license.activatedAt, expiresAt: license.expiresAt, paymentStatus: decided.paymentStatus }),
      ]);
      context?.waitUntil(sendTenantPush(env, tenantId, { id, title: selectedPlan === "demo" ? "Bank Setu demo activated" : "Bank Setu license approved", body: selectedPlan === "demo" ? "Your five-day Demo is ready. Sign in to complete setup." : "Your Bank Setu license is ready. Sign in to complete setup." }));
      return json({ success: true, status: "approved", tenantId, license });
    }
    const tenantId = String(item.tenantId || "");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)) return json({ error: "Invalid tenant." }, 400);
    const tenantDoc = await licenseDoc(env, `/tenants/${tenantId}`);
    if (!tenantDoc || licenseFields(tenantDoc).status !== "active") return json({ error: "Active tenant not found." }, 409);
    const currentDoc = await licenseDoc(env, `/tenantLicenses/${tenantId}`);
    const current = licenseFields(currentDoc);
    const now = new Date().toISOString();
    const approved = action === "approve";
    if (approved && body.paymentConfirmed !== true) return json({ error: "Master Admin must confirm payment before approval." }, 400);
    const decided = { ...item, status: approved ? "approved" : "rejected", paymentStatus: approved ? "payment_confirmed" : "rejected", decidedAt: now, decidedBy: actor.uid, updatedAt: now };
    const startAt=licenseStartDate(body.startDate);
    if(startAt===null)return json({error:"Select a valid India activation date."},400);
    const durationMonths=body.durationMonths===undefined?12:Number(body.durationMonths);
    const paidPaise=body.paidPaise===undefined?Number(item.quotedPaise):Number(body.paidPaise);
    if(approved&&(!Number.isSafeInteger(paidPaise)||paidPaise<0||paidPaise>100_000_000||!Number.isInteger(durationMonths)||durationMonths<1||durationMonths>120))return json({error:"Confirm the paid amount and valid duration."},400);
    const audit={ action: approved ? "approved" : "rejected", requestId: id, tenantId, actorUid: actor.uid, at: now, previousRevision: current.revision || 0, before:currentDoc?{plan:current.plan,status:current.status,expiresAt:current.expiresAt}:null, paymentStatus:decided.paymentStatus, transactionId:item.transactionId||"",paymentDate:item.paymentDate||"",paidPaise:approved?paidPaise:null };
    const writes = [licenseWrite(env, "licenseRequests", id, decided, { updateTime: requestDoc.updateTime })];
    if (approved) {
      const demoConversion=current.plan==="demo";
      if(demoConversion && ["suspended","revoked"].includes(current.status))return json({error:"Reactivate this tenant's Demo license before approving a paid conversion."},409);
      const next = transitionLicense(demoConversion ? null : currentDoc ? current : null, { ...item, kind:demoConversion?item.requestedPlan:item.kind, id, quotedPaise:paidPaise, startAt, durationMonths }, now, settings.pricing);
      if(demoConversion){next.revision=Number(current.revision||0)+1;next.firstActivatedAt=current.firstActivatedAt||current.activatedAt;next.demoOnly=false;}
      next.tenantId = tenantId;
      next.graceDays = settings.pricing.graceDays;
      audit.after={plan:next.plan,status:next.status,activatedAt:next.activatedAt,expiresAt:next.expiresAt,revision:next.revision};
      writes.push(licenseWrite(env, "tenantLicenses", tenantId, next, currentDoc ? { updateTime: currentDoc.updateTime } : { exists: false }));
    }
    writes.push(licenseWrite(env,"licenseAudit",crypto.randomUUID(),audit));
    try { await licenseCommit(env, writes); }
    catch (error) { if (error.status === 409) return json({ error: "License changed during approval. Refresh and retry." }, 409); throw error; }
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: approved?"Bank Setu license approved":"Bank Setu request rejected", body: approved?"Your license request has been approved. Open Bank Setu for details.":"Your request was rejected. Open Bank Setu for the current status." }));
    return json({ success: true, status: decided.status });
  }
  if (route === "/license-admin-state") {
    if (!master) return json({ error: "Master Admin access is required." }, 403);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId || "");
    const action = String(body.action || "");
    const id = String(body.requestId || "");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) || !/^[a-f0-9-]{36}$/.test(id) || !["suspend", "reactivate", "revoke"].includes(action)) return json({ error: "Invalid license state request." }, 400);
    const document = await licenseDoc(env, `/tenantLicenses/${tenantId}`);
    if (!document) return json({ error: "License not found." }, 404);
    const current = licenseFields(document);
    if (current.lastRequestId === id) return json({ success: true, repeated: true });
    if (current.status === "revoked" || (action === "reactivate" && current.status !== "suspended") || (action !== "reactivate" && !["active", "scheduled", "suspended"].includes(current.status))) return json({ error: "License state changed. Refresh before retrying." }, 409);
    const status = action === "reactivate" ? "active" : action === "suspend" ? "suspended" : "revoked";
    if (status === current.status) return json({ error: "License is already in that state." }, 409);
    const now = new Date().toISOString();
    await licenseCommit(env, [
      licenseWrite(env, "tenantLicenses", tenantId, { ...current, status, revision: Number(current.revision || 0) + 1, updatedAt: now, lastRequestId: id }, { updateTime: document.updateTime }),
      licenseWrite(env, "licenseAudit", id, { action, actorUid: actor.uid, tenantId, before: current.status, after: status, at: now }),
    ]);
    context?.waitUntil(sendTenantPush(env, tenantId, { id, title: status === "active" ? "Bank Setu license reactivated" : `Bank Setu license ${status}`, body: "Open Bank Setu for details about your license." }));
    return json({ success: true, status });
  }
  return json({ error: "Not found." }, 404);
}

async function handleMasterOperation(request, env, actor, route) {
  if(route === "/afsm-confirmation") {
    if(!["master_owner","admin","client_admin","client_user","user"].includes(actor.profile.role))return json({error:"Customer write permission is required."},403);
    const body=await request.json().catch(()=>({}));
    if(!/^[a-f0-9-]{36}$/i.test(body.operationId||""))return json({error:"Invalid AFSM operation."},400);
    return json({uid:actor.uid,tenantId:actor.profile.tenantId||"",confirmedAt:new Date().toISOString()});
  }
  const role = String(actor.profile.role || "").toLowerCase();
  if (route === "/bootstrap-master-owner") {
    const account = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: request.headers.get("authorization").replace(/^Bearer\s+/i, "").trim() }),
    }).then((response) => response.json());
    const user = account.users?.[0];
    if (String(user?.email || "").toLowerCase() !== "banksetu2026@gmail.com" || user.emailVerified !== true) {
      return json({ error: "Only the verified Bank Setu owner account can become Master Admin." }, 403);
    }
    const owners = await firestoreRequest(env, ":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "users" }], where: { fieldFilter: { field: { fieldPath: "role" }, op: "EQUAL", value: { stringValue: "master_owner" } } }, limit: 1 } }),
    });
    if (owners.some((row) => row.document)) return json({ error: "A Master Admin is already configured." }, 409);
    await putDocument(env, `/users/${encodeURIComponent(actor.uid)}`, {
      name: String(user.displayName || actor.profile.name || "Bank Setu Owner"),
      email: "banksetu2026@gmail.com", role: "master_owner", status: "approved", subscriptionStatus: "active",
      masterOwnerBootstrappedAt: new Date().toISOString(),
    });
    return json({ success: true, role: "master_owner" });
  }

  if (route === "/get-google-setup") {
    if (!["master_owner", "admin", "client_admin", "client_user"].includes(role)) return json({ error: "Administrator access is required." }, 403);
    return getGoogleSetupConfig(env, actor);
  }

  if (route === "/save-google-setup") {
    if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can change Bank Setu Google setup." }, 403);
    const body = await request.json().catch(() => ({}));
    const oauthClientId = String(body.oauthClientId || "").trim();
    const apiUrl = String(body.apiUrl || "").trim();
    const executorEmail = String(body.executorEmail || "").trim().toLowerCase();
    if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(oauthClientId) ||
        !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(executorEmail)) {
      return json({ error: "Enter the Web Client ID, Apps Script URL and deployment owner email." }, 400);
    }
    await putDocument(env, "/appSettings/googleSetup", { oauthClientId, apiUrl, executorEmail, updatedBy: actor.uid, updatedAt: new Date().toISOString() });
    return json({ success: true });
  }

  if (route === "/create-client-invite") {
    if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can invite clients." }, 403);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const bankName = String(body.bankName || "").trim();
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !bankName || bankName.length > 120) return json({ error: "Enter a valid name, email and bank name." }, 400);
    const setup = licenseFields(await licenseDoc(env, "/appSettings/googleSetup"));
    setup.oauthClientId ||= env.BANKSETU_GOOGLE_OAUTH_CLIENT_ID;
    setup.apiUrl ||= env.BANKSETU_APPS_SCRIPT_URL;
    setup.executorEmail ||= env.BANKSETU_APPS_SCRIPT_EXECUTOR_EMAIL;
    if (!setup.oauthClientId || !setup.apiUrl || !setup.executorEmail) return json({ error: "Complete the one-time Google setup first." }, 409);
    const password = `${crypto.randomUUID()}${crypto.randomUUID()}aA1!`;
    let uid;
    try { uid = await createFirebaseAccount(env, email, password, name); }
    catch (error) { return json({ error: error.status === 400 ? "This email already has an account. Associate its existing tenant instead." : "Could not create the client invitation." }, 409); }
    const tenantId = crypto.randomUUID().replaceAll("-", "");
    try {
      const now = new Date().toISOString();
      await licenseCommit(env, [
        licenseWrite(env, "tenants", tenantId, { tenantId, clientId: tenantId, ownerUid: uid, bankName, maxUsers: 2, clientUserCount: 0, status: "active", createdAt: now, createdBy: actor.uid }),
        licenseWrite(env, "tenantSettings", tenantId, { tenantId, bankName, apiUrl: String(setup.apiUrl), spreadsheetId: "", photoFolderId: "", bankInfo: {}, bankLogo: "", updatedAt: now, updatedBy: actor.uid }),
        licenseWrite(env, "users", uid, { name, email, role: "client_admin", tenantId, clientId: tenantId, parentClientUid: actor.uid, bankName, maxUsers: 2, status: "pending", subscriptionStatus: "inactive", licensingInvite: true, licenseRequired: true, createdAt: now, createdBy: actor.uid }),
        licenseWrite(env, "licenseAudit", crypto.randomUUID(), { action: "client_invited", actorUid: actor.uid, tenantId, at: now }),
      ]);
    } catch (error) { await authDelete(env, uid).catch(() => undefined); throw error; }
    // Firebase sends a one-time password setup link. No password is returned or stored.
    const emailResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    });
    if (!emailResponse.ok) return json({ success: true, uid, tenantId, emailDelivered: false, warning: "Account created pending licensing, but password setup email could not be delivered. Use Firebase account recovery before activation." });
    return json({ success: true, uid, tenantId, emailDelivered: true });
  }

  if (route === "/create-client") {
    if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can create Client Admin accounts." }, 403);
    // Client creation is centralized in Master Admin Profile. License assignment remains
    // a separate, server-authorized step; the existing account is not granted a license here.
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const bankName = String(body.bankName || "").trim();
    const inquiryId = String(body.inquiryId || "").trim();
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !bankName || bankName.length > 120 || password.length < 8 || password.length > 128) {
      return json({ error: "Enter a valid client name, email, bank name and password (at least 8 characters)." }, 400);
    }
    let inquiryDoc = null, inquiry = {};
    if (inquiryId) {
      if (!/^[a-f0-9-]{36}$/i.test(inquiryId)) return json({ error: "Select a valid pending inquiry." }, 400);
      inquiryDoc = await licenseDoc(env, `/licenseRequests/${inquiryId}`);
      inquiry = licenseFields(inquiryDoc);
      if (!inquiryDoc || inquiry.kind !== "inquiry" || inquiry.status !== "pending" || inquiry.onboardingStage !== "client_creation_required" || inquiry.tenantId) return json({ error: "This inquiry is no longer waiting for client creation." }, 409);
      if (String(inquiry.email || "").trim().toLowerCase() !== email) return json({ error: "Use the same verified email address submitted with this inquiry." }, 409);
    }
    const setup = await firestoreRequest(env, "/appSettings/googleSetup").catch(() => null);
    const setupData = decodeFields(setup?.fields || {});
    setupData.oauthClientId ||= env.BANKSETU_GOOGLE_OAUTH_CLIENT_ID;
    setupData.apiUrl ||= env.BANKSETU_APPS_SCRIPT_URL;
    setupData.executorEmail ||= env.BANKSETU_APPS_SCRIPT_EXECUTOR_EMAIL;
    if (!setupData.oauthClientId || !setupData.apiUrl || !setupData.executorEmail) return json({ error: "Complete the one-time Google setup first." }, 409);
    let newUid;
    try { newUid = await createFirebaseAccount(env, email, password, name); }
    catch (error) { return json({ error: error.status === 400 ? "An account already uses this email." : "Could not create the Client Admin account." }, 409); }
    const tenantId = crypto.randomUUID().replaceAll("-", "");
    try {
      const now = new Date().toISOString();
      const documents = [
        [firestoreDocumentName(env, `/licenseAudit/${crypto.randomUUID()}`), {action:"client_created",tenantId,actorUid:actor.uid,at:now,...(inquiryId?{requestId:inquiryId}:{})}],
        [firestoreDocumentName(env, `/tenants/${tenantId}`), { tenantId, clientId: tenantId, ownerUid: newUid, name, email, bankName, maxUsers: 2, clientUserCount: 0, status: "active", createdAt: now, createdBy: actor.uid }],
        [firestoreDocumentName(env, `/tenantSettings/${tenantId}`), { tenantId, bankName, apiUrl: String(setupData.apiUrl), spreadsheetId: "", photoFolderId: "", bankInfo: {}, bankLogo: "", updatedAt: now, updatedBy: actor.uid }],
        [firestoreDocumentName(env, `/users/${newUid}`), { name, email, role: "client_admin", tenantId, clientId: tenantId, parentClientUid: actor.uid, bankName, maxUsers: 2, status: "approved", subscriptionStatus: "active", licenseRequired: true, createdAt: now, createdBy: actor.uid }],
      ];
      const writes = documents.map(([docName, fields]) => ({ update: { name: docName, fields: encodeFields(fields) }, currentDocument: { exists: false } }));
      if (inquiryDoc) writes.push(licenseWrite(env, "licenseRequests", inquiryId, {
        ...inquiry, name, email, bankName, tenantId, clientUid: newUid, onboardingStage: "client_created", updatedAt: now, linkedBy: actor.uid,
      }, { updateTime: inquiryDoc.updateTime }));
      await firestoreRequest(env, ":commit", { method: "POST", body: JSON.stringify({ writes }) });
      return json({ success: true, uid: newUid, tenantId, inquiryId: inquiryId || null, role: "client_admin" });
    } catch (error) {
      await authDelete(env, newUid).catch(() => undefined);
      throw error;
    }
  }

  if (route === "/save-workspace-bank-settings") {
    const path = workspaceBankSettingsPath(actor);
    if (!path) return json({ error:"Only a Client Admin or Master Admin can change bank settings." },403);
    const body = await request.json().catch(() => ({}));
    let patch;
    try { patch = validateWorkspaceBankPatch(body); }
    catch(error) { return json({error:error.message},400); }
    if (patch.bankInfo) {
      const previous=await firestoreRequest(env,path).catch(error=>error.status===404?null:Promise.reject(error));
      const old=decodeFields(previous?.fields||{});
      const extra=["branchAddress","branchPostOffice","branchDistrict","branchState","branchPinCode","branchEmail","branchPhone","ifsc","micr","branchCode","gstin","ckyc"];
      for(const key of extra) if(patch.bankInfo[key]===undefined && typeof (old.bankInfo||{})[key]==="string") {
        patch.bankInfo[key]=old.bankInfo[key];
      }
      for(const key of extra) if(patch.bankInfo[key]!==undefined) patch[key]=patch.bankInfo[key];
    }
    const metadata = {updatedAt:new Date().toISOString(),updatedBy:actor.uid};
    if (role === "client_admin") metadata.tenantId = actor.profile.tenantId;
    await putDocument(env,path,{...patch,...metadata});
    return json({success:true});
  }

  if (route === "/save-client-registration") {
    if (role !== "client_admin" || !actor.profile.tenantId) return json({ error: "Only a Client Admin assigned to a workspace can save bank details." }, 403);
    const body = await request.json().catch(() => ({}));
    const registration = {
      bankName: String(body.bankName || "").trim(), passbookBank: String(body.passbookBank || "").trim(),
      branchName: String(body.branchName || "").trim(), cspCode: String(body.cspCode || "").trim(),
      operatorName: String(body.operatorName || "").trim(), address: String(body.address || "").trim(), mobile: String(body.mobile || "").trim(),
    };
    if (!registration.bankName || !registration.passbookBank || !registration.branchName || !registration.operatorName || registration.bankName.length > 120 || registration.cspCode.length > 80 || registration.address.length > 500 || registration.operatorName.length > 120 || registration.branchName.length > 120 || registration.passbookBank.length > 120 || registration.mobile && !/^[+0-9 ()-]{7,20}$/.test(registration.mobile)) return json({ error: "Complete the required bank, branch and operator details." }, 400);
    await putDocument(env, `/tenantSettings/${encodeURIComponent(actor.profile.tenantId)}`, { tenantId: actor.profile.tenantId, ...registration, bankInfo: registration, updatedAt: new Date().toISOString(), updatedBy: actor.uid });
    return json({ success: true });
  }

  if(route === "/presence-heartbeat") {
    const body=await request.json().catch(()=>({}));
    await putDocument(env,`/onlinePresence/${actor.uid}`,{uid:actor.uid,role,tenantId:String(actor.profile.tenantId||""),lastSeen:new Date().toISOString(),active:body.active!==false});
    return json({success:true});
  }
  if(route === "/master-system-status") {
    if(!isMasterActor(actor))return json({error:"Master Admin permission is required."},403);
    const body=await request.json().catch(()=>({}));
    return json(await masterUsage(env,serviceAccessToken,firestoreRequest,decodeFields,{force:body.force===true}));
  }
  if (route === "/get-offline-session") {
    if(isMasterActor(actor)) {
      const config=await getGoogleSetupConfig(env,actor).then(response=>response.json());
      if(!config.masterLocalReady)return json({error:"Update the existing Master Apps Script deployment to enable local sync."},409);
      const issuedAt=Date.now();return json(await createOfflineSession(env.FIREBASE_SERVICE_ACCOUNT,{uid:actor.uid,tenantId:`master:${actor.uid}`,role:role==="admin"?"admin":"master_owner",status:"approved",subscriptionStatus:"active",connectionId:config.masterConnectionId,apiUrl:config.apiUrl,issuedAt,expiresAt:issuedAt+8*60*60*1000}));
    }
    if (!["client_admin","client_user"].includes(role)) return json({error:"Offline customer access requires a client workspace."},403);
    const config=await getGoogleSetupConfig(env,actor).then(response=>response.json());
    if(config.connectionMode!=="option-b" || !config.dataApiReady || !config.hasWorkspace || config.workspaceStatus!=="active") return json({error:"Connect an active Option B workspace before enabling offline access."},409);
    const issuedAt=Date.now();
    let offlineUntil=issuedAt+8*3600000;
    if(["client_admin","client_user"].includes(role)){
      const license=licenseFields(await licenseDoc(env,`/tenantLicenses/${encodeURIComponent(actor.profile.tenantId)}`));
      const view=licenseView(license.tenantId?license:{status:"pending"},issuedAt);
      if(!view.canWrite)return json({error:"An active license is required for offline access."},403);
      offlineUntil=Math.min(issuedAt+5*86400000,["annual","demo"].includes(license.plan)?Date.parse(license.expiresAt):Infinity);
    }
    return json(await createOfflineSession(env.FIREBASE_SERVICE_ACCOUNT,{uid:actor.uid,tenantId:actor.profile.tenantId,role,status:"approved",subscriptionStatus:"active",licenseRequired:true,connectionId:config.connectionId,apiUrl:config.apiUrl,issuedAt,expiresAt:offlineUntil}));
  }

  if (route === "/connect-option-b") {
    if (role !== "client_admin" || !actor.profile.tenantId || !actor.emailVerified) return json({ error: "Only a Client Admin with a verified email can connect resources owned by that email." }, 403);
    const body = await request.json().catch(() => ({}));
    const spreadsheetId = parseGoogleResource(body.sheetLink, "sheet");
    const photoFolderId = parseGoogleResource(body.folderLink, "folder");
    const bridgeUrl = String(body.bridgeUrl || "").trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bridgeUrl)) return json({ error: "Enter your authorized client-owned Apps Script bridge URL." }, 400);
    const tenantId = actor.profile.tenantId;
    const tenantResult = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`);
    const tenant = decodeFields(tenantResult.fields);
    if (tenant.ownerUid !== actor.uid) return json({ error: "Only the workspace owner can change its connection." }, 403);
    const token = await driveServiceAccessToken(env);
    const read = async (id) => {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,mimeType,owners(emailAddress),parents,trashed,driveId,capabilities(canEdit)`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Share both resources with the Bank Setu sync service as Editor before connecting.");
      return response.json();
    };
    const [sheet, folder] = await Promise.all([read(spreadsheetId), read(photoFolderId)]);
    validateResourceOwnership(sheet, folder, actor.email);
    const statusResponse = await fetch(`${bridgeUrl}?action=status`, { signal: AbortSignal.timeout(10000) });
    const status = await statusResponse.json();
    if (!statusResponse.ok || status.tenantIsolationVersion !== "v3" || status.tenantId !== tenantId || status.spreadsheetId !== spreadsheetId || status.photoFolderId !== photoFolderId || String(status.ownerEmail || "").toLowerCase() !== actor.email.toLowerCase()) return json({ error: "The bridge must run as your Google account and be bound to this tenant, Sheet and folder." }, 409);
    if (status.licenseEnforcementVersion !== 2) return json({ error: "Deploy the current Bank Setu Apps Script bridge with license enforcement before connecting this licensed workspace." }, 409);
    const headersRead = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:X1`, { headers: { authorization: `Bearer ${token}` } });
    if (!headersRead.ok) return json({ error: "Sheet1 is missing or not accessible." }, 409);
    const row = (await headersRead.json()).values?.[0] || [];
    const expected = ["ENDROL ID", "ACCOUNT NO", "NAME", "C/O NAME", "STATUSTUS", "GENDER", "CONTACT", "A/C OPENING DATE", "ADDRESS", "NOMENIEE", "POST OFFICE", "PASS BOOK", "UIADI NO.", "dbt status", "PURPOSE OF ADVANCE", "FULL ADDRESS", "PIN CODE", "PAN", "AOF NO", "PHOTO URL", "PDF URL", "CREATED AT", "UPDATED AT", "UPDATED BY"];
    if (row.length && !expected.every((name, i) => row[i] === name)) return json({ error: "Sheet headers do not match Bank Setu. Existing data was not changed." }, 409);
    // Reserve both resources atomically; never bind one resource to two tenants.
    const path = `/tenantSettings/${encodeURIComponent(tenantId)}`;
    const prior = await firestoreRequest(env, path).catch(error => error.status === 404 ? null : Promise.reject(error));
    const old = decodeFields(prior?.fields || {});
    if (!old.bankName || !old.bankInfo?.passbookBank || !old.bankInfo?.branchName || !old.bankInfo?.operatorName) return json({error:"Save the client bank registration before connecting."},409);
    const changed = old.spreadsheetId !== spreadsheetId || old.photoFolderId !== photoFolderId || old.bridgeUrl !== bridgeUrl;
    const fields = { ...old, tenantId, connectionMode: "option-b", bridgeUrl, apiUrl: bridgeUrl, spreadsheetId, photoFolderId, workspaceOwnerUid: actor.uid, googleEmail: actor.email, connectionId: changed ? crypto.randomUUID() : old.connectionId || crypto.randomUUID(), updatedBy: actor.uid, updatedAt: new Date().toISOString() };
    const writes = [];
    for (const id of [spreadsheetId, photoFolderId]) {
      const bindingPath = `/googleResourceBindings/${id}`;
      const binding = await firestoreRequest(env, bindingPath).catch(error => error.status === 404 ? null : Promise.reject(error));
      if (binding && decodeFields(binding.fields).tenantId !== tenantId) return json({ error: "This Google resource is already reserved for a different client." }, 409);
      writes.push({ update: { name: firestoreDocumentName(env, bindingPath), fields: encodeFields({ tenantId, resourceId: id }) }, currentDocument: binding ? { updateTime: binding.updateTime } : { exists: false } });
    }
    writes.push({ update: { name: firestoreDocumentName(env, path), fields: encodeFields(fields) }, currentDocument: prior ? { updateTime: prior.updateTime } : { exists: false } });
    await firestoreRequest(env, ":commit", { method: "POST", body: JSON.stringify({ writes }) });
    return json({ success: true, connectionId: fields.connectionId });
  }

  if (route === "/configure-tenant-data") {
    if (role !== "client_admin") return json({ error: "Only the Client Admin can connect their own Google workspace." }, 403);
    if (["client_admin","client_user"].includes(role)) return json({ error: "Use the verified Option B connection for this licensed workspace." }, 409);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId || "").trim();
    const spreadsheetId = String(body.spreadsheetId || "").trim();
    const photoFolderId = String(body.photoFolderId || "").trim();
    const accessToken = String(body.accessToken || "").trim();
    if (!/^[A-Za-z0-9_-]{20,}$/.test(tenantId) || !/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId) || !/^[A-Za-z0-9_-]{20,}$/.test(photoFolderId)) return json({ error: "Enter valid Sheet, folder and client workspace IDs." }, 400);
    if (actor.profile.tenantId !== tenantId) return json({ error: "You can only connect your own client workspace." }, 403);
    const tenant = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`).catch((error) => error.status === 404 ? null : Promise.reject(error));
    const tenantData = decodeFields(tenant?.fields || {});
    if (!tenant || tenantData.status !== "active") return json({ error: "Active client workspace not found." }, 404);
    const ownership = await verifyOrRepairWorkspaceOwner(env, tenantId, tenantData, actor.uid);
    if (!ownership.ok) return json({ error: ownership.error }, 409);
    Object.assign(tenantData, ownership.tenantData);
    const setupResponse = await firestoreRequest(env, "/appSettings/googleSetup").catch(() => null);
    const setup = decodeFields(setupResponse?.fields || {});
    const apiUrl = String(setup.apiUrl || env.BANKSETU_APPS_SCRIPT_URL || "");
    let googleEmail = String(body.googleEmail || "").trim().toLowerCase();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl)) return json({ error: "Finish the Bank Setu Google setup first." }, 409);
    {
      const config = await getGoogleSetupConfig(env, actor).then((response) => response.json());
      const bankInfo = config.bankInfo || {};
      if (!config.bankName || !bankInfo.passbookBank || !bankInfo.branchName || !bankInfo.operatorName) return json({ error: "Complete the client bank registration form before connecting Google Drive." }, 409);
      if (!accessToken || accessToken.length < 20 || accessToken.length > 8192) return json({ error: "Reconnect Google Drive and try again." }, 400);
      const headers = { authorization: `Bearer ${accessToken}` };
      const fields = encodeURIComponent("id,mimeType,owners(emailAddress),parents,trashed");
      const googleGet = async (url) => {
        const response = await fetch(url, { headers });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Google could not verify your workspace. Reconnect Google and retry.");
        return value;
      };
      const [googleProfile, sheet, folder] = await Promise.all([
        googleGet("https://www.googleapis.com/oauth2/v2/userinfo"),
        googleGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=${fields}`),
        googleGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photoFolderId)}?fields=${fields}`),
      ]);
      googleEmail = String(googleProfile.email || "").toLowerCase();
      if (!googleEmail || (body.googleEmail && googleEmail !== String(body.googleEmail).toLowerCase()) || String(sheet.owners?.[0]?.emailAddress || "").toLowerCase() !== googleEmail || String(folder.owners?.[0]?.emailAddress || "").toLowerCase() !== googleEmail) return json({ error: "The Sheet and Drive folder must belong to the Google account you connected." }, 403);
      if (sheet.id !== spreadsheetId || sheet.mimeType !== "application/vnd.google-apps.spreadsheet" || sheet.trashed || !sheet.parents?.includes(photoFolderId) || folder.id !== photoFolderId || folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) return json({ error: "The Sheet must be inside a valid Bank Setu Drive folder." }, 400);
      const permissions = await googleGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photoFolderId)}/permissions?fields=permissions(emailAddress,role)`);
      const executor = permissions.permissions?.find((item) => String(item.emailAddress || "").toLowerCase() === String(setup.executorEmail || "").toLowerCase());
      if (!executor || !["writer", "owner"].includes(String(executor.role))) return json({ error: "Share the workspace folder with the Bank Setu Apps Script account, then retry." }, 409);
      const headersRead = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent("Sheet1!A1:X1")}`, { headers });
      const row = await headersRead.json().catch(() => ({}));
      const expected = ["ENDROL ID", "ACCOUNT NO", "NAME", "C/O NAME", "STATUSTUS", "GENDER", "CONTACT", "A/C OPENING DATE", "ADDRESS", "NOMENIEE", "POST OFFICE", "PASS BOOK", "UIADI NO.", "dbt status", "PURPOSE OF ADVANCE", "FULL ADDRESS", "PIN CODE", "PAN", "AOF NO", "PHOTO URL", "PDF URL", "CREATED AT", "UPDATED AT", "UPDATED BY"];
      const existing = row.values?.[0] || [];
      if (existing.length && existing.some((cell) => String(cell || "").trim())) {
        if (!expected.every((header, index) => existing[index] === header)) return json({ error: "This Sheet has different column headers. Create a new Bank Setu Sheet." }, 409);
      } else {
        const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent("Sheet1!A1:X1")}?valueInputOption=RAW`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ values: [expected] }) });
        if (!write.ok) return json({ error: "Google could not add Bank Setu columns. Reconnect and retry." }, 409);
      }
    }
    await putDocument(env, `/tenantSettings/${encodeURIComponent(tenantId)}`, {
      tenantId, bankName: String(tenantData.bankName || ""), apiUrl, spreadsheetId, photoFolderId,
      workspaceOwnerUid: actor.uid,
      ...(googleEmail ? { googleEmail } : {}), updatedAt: new Date().toISOString(), updatedBy: actor.uid,
    });
    return json({ success: true, tenantId });
  }

  if (route === "/save-bank-format-template" || route === "/save-bank-format-mapping") {
    if (role !== "client_admin" || !actor.profile.tenantId) return json({ error: "Only a Client Admin can change this workspace's bank formats." }, 403);
    const tenantId = String(actor.profile.tenantId);
    const body = await request.json().catch(() => ({}));
    const formatType = String(body.formatType || "");
    if (!["passbook", "quickPassbook", "accountOpening"].includes(formatType)) return json({ error: "Choose a supported bank format." }, 400);
    const settingsResult = await firestoreRequest(env, `/tenantSettings/${encodeURIComponent(tenantId)}`);
    const settings = decodeFields(settingsResult.fields || {});
    const selectedBank = String(settings.passbookBank || "").trim().toLowerCase().replace(/\s+/g, " ");
    const selectionError = bankFormatSelectionError(settings.passbookBank, body.selectedBank);
    if (selectionError) return json({ error: selectionError }, 400);
    const formats = settings.bankFormats || {};
    if (route === "/save-bank-format-template") {
      const fileId = String(body.fileId || "");
      const fileName = String(body.fileName || "").trim();
      const mimeType = String(body.mimeType || "").toLowerCase();
      const accessToken = String(body.accessToken || "");
      if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId) || !fileName || fileName.length > 200 || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType) || (settings.connectionMode !== "option-b" && accessToken.length < 20)) return json({ error: "Upload a valid PDF or image sample." }, 400);
      const headers = { authorization: `Bearer ${settings.connectionMode === "option-b" ? await driveServiceAccessToken(env) : accessToken}` };
      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,owners(emailAddress),parents,size,trashed`, { headers });
      const file = await fileResponse.json().catch(() => ({}));
      const connectedEmail = String(settings.googleEmail || "").toLowerCase();
      if (!fileResponse.ok || file.id !== fileId || file.trashed || String(file.owners?.[0]?.emailAddress || "").toLowerCase() !== connectedEmail || !file.parents?.includes(String(settings.photoFolderId)) || String(file.mimeType || "").toLowerCase() !== mimeType || Number(file.size) > 5 * 1024 * 1024) return json({ error: "The sample must be owned by your connected Google account and stored in this workspace folder." }, 403);
      formats[formatType] = { bankKey: selectedBank, fileId, fileName: String(file.name || fileName).slice(0, 200), mimeType, updatedAt: new Date().toISOString(), updatedBy: actor.uid };
    } else {
      const width = Number(body.pageWidthMm); const height = Number(body.pageHeightMm);
      const fields = new Set(["dateOfBirth", "religion", "category", "village", "name", "fatherName", "accountNo", "customerId", "aofNo", "gender", "mobile", "aadhaar", "pan", "address", "branchName", "ifsc", "accountOpeningDate", "nominee", "postOffice", "pinCode", "status", "customerPhoto"]);
      const fieldMap = Array.isArray(body.fieldMap) ? body.fieldMap : [];
      if (!formats[formatType]?.fileId || formats[formatType]?.bankKey !== selectedBank || !Number.isFinite(width) || !Number.isFinite(height) || width < 50 || width > 500 || height < 50 || height > 500 || fieldMap.length > 50) return json({ error: "Upload a sample and enter valid page dimensions first." }, 400);
      const normalized = fieldMap.map((item) => ({ field: String(item.field || ""), page: Number(item.page || 1), x: Number(item.x), y: Number(item.y), width: Number(item.width), ...(item.height !== undefined ? { height: Number(item.height) } : {}), fontSize: Number(item.fontSize), uppercase: item.uppercase === true, align: String(item.align || "left") }));
      if (normalized.some((item) => ![item.x,item.y,item.width,item.fontSize,item.page].every(Number.isFinite) || (item.height !== undefined && (!Number.isFinite(item.height) || item.height < 0.2 || item.height > 100 || item.y + item.height > 100.1)) || !fields.has(item.field) || !["left", "center", "right"].includes(item.align) || item.x < 0 || item.x > 100 || item.y < 0 || item.y > 100 || item.width < 1 || item.width > 100 || item.fontSize < 5 || item.fontSize > 48 || !Number.isInteger(item.page) || item.page < 1 || item.page > 10)) return json({ error: "A mapped field has an invalid key or position." }, 400);
      if (body.mappingType !== undefined && !["print", "extraction"].includes(body.mappingType)) return json({ error: "Invalid mapping type." }, 400);
      const mappingKey = body.mappingType === "extraction" ? "extractionMap" : "fieldMap";
      formats[formatType] = { ...formats[formatType], pageWidthMm: width, pageHeightMm: height, [mappingKey]: normalized, mappingUpdatedAt: new Date().toISOString(), mappingUpdatedBy: actor.uid };
    }
    await putDocument(env, `/tenantSettings/${encodeURIComponent(tenantId)}`, { bankFormats: formats });
    return json({ success: true, formatType });
  }

  return json({ error: "Not found." }, 404);
}

async function createClientUser(request, env, actor) {
  const actorRole = String(actor.profile.role || "").toLowerCase();
  const tenantId = String(actor.profile.tenantId || "").trim();
  if (actorRole !== "client_admin" || !tenantId) {
    return json({ error: "Only a Client Admin assigned to a workspace can create its users." }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "Enter a valid name and email address." }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: "Password must be 8 to 128 characters." }, 400);
  }
  const tenant = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`);
  const tenantData = decodeFields(tenant.fields || {});
  if (tenantData.status !== "active") return json({ error: "This client workspace is not active." }, 409);
  const usedSeats = Number(tenantData.clientUserCount || 0);
  const maxUsers = Number(tenantData.maxUsers || 2);
  if (usedSeats >= maxUsers) return json({ error: `This workspace allows ${maxUsers} client users.` }, 409);

  const serviceToken = await serviceAccessToken(env);
  const createResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceToken}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: name }),
  });
  const account = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !account.localId) {
    const code = account.error?.message || "ACCOUNT_CREATION_FAILED";
    return json({ error: code.includes("EMAIL_EXISTS") ? "An account already uses this email." : "Could not create this account." }, 409);
  }
  const newUid = account.localId;
  try {
    const tenantName = firestoreDocumentName(env, `/tenants/${encodeURIComponent(tenantId)}`);
    const userName = firestoreDocumentName(env, `/users/${encodeURIComponent(newUid)}`);
    const profile = {
      name,
      email,
      role: "client_user",
      tenantId,
      clientId: tenantId,
      parentClientUid: actor.uid,
      bankName: String(tenantData.bankName || ""),
      status: "approved",
      subscriptionStatus: "active",
      licenseRequired: true,
      createdAt: new Date().toISOString(),
      createdBy: actor.uid,
    };
    const commit = await firestoreRequest(env, ":commit", {
      method: "POST",
      body: JSON.stringify({ writes: [
        {
          update: { name: tenantName, fields: { clientUserCount: { integerValue: String(usedSeats + 1) } } },
          updateMask: { fieldPaths: ["clientUserCount"] },
          currentDocument: { updateTime: tenant.updateTime },
        },
        {
          update: { name: userName, fields: encodeFields(profile) },
          currentDocument: { exists: false },
        },
      ] }),
    });
    return json({ success: true, uid: newUid, tenantId, role: "client_user", writeTime: commit.writeResults?.[0]?.updateTime });
  } catch (error) {
    await authDelete(env, newUid).catch(() => undefined);
    if (error.status === 409 || error.status === 400) return json({ error: "The workspace changed while creating the account. Please retry." }, 409);
    throw error;
  }
}

async function authUpdate(env, localId, values) {
  const token = await serviceAccessToken(env);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ localId, ...values }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || "Firebase Authentication update failed.");
  return result;
}

async function authDelete(env, localId) {
  const token = await serviceAccessToken(env);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:delete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ localId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && result.error?.message !== "USER_NOT_FOUND") {
    throw new Error(result.error?.message || "Firebase Authentication deletion failed.");
  }
}

async function listWorkspaceUsers(env, tenantId) {
  const result = await firestoreRequest(env, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "users" }],
      where: { fieldFilter: { field: { fieldPath: "tenantId" }, op: "EQUAL", value: { stringValue: tenantId } } },
    } }),
  });
  return result.filter((row) => row.document).map((row) => ({
    uid: row.document.name.split("/").pop(),
    ...decodeFields(row.document.fields || {}),
  }));
}

async function recoverMissingClientTenant(env, uid, profile, tenantId) {
  const users = await listWorkspaceUsers(env, tenantId);
  const admins = users.filter((user) => String(user.role || "").toLowerCase() === "client_admin");
  const unexpected = users.filter((user) => !["client_admin", "client_user"].includes(String(user.role || "").toLowerCase()));
  if (admins.length !== 1 || admins[0]?.uid !== uid || unexpected.length) return null;
  const settingsResult = await firestoreRequest(env, `/tenantSettings/${encodeURIComponent(tenantId)}`).catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  const settings = decodeFields(settingsResult?.fields || {});
  if ((settings.spreadsheetId || settings.photoFolderId) && settings.workspaceOwnerUid !== uid) return null;
  const now = new Date().toISOString();
  await putDocument(env, `/tenants/${encodeURIComponent(tenantId)}`, {
    tenantId, clientId: tenantId, ownerUid: uid,
    bankName: String(profile.bankName || settings.bankName || ""),
    maxUsers: 2, clientUserCount: users.filter((user) => String(user.role || "").toLowerCase() === "client_user").length,
    status: "active", recoveredAt: now, recoveredFor: "approved_client_admin_setup",
  });
  return { fields: encodeFields({ tenantId, ownerUid: uid, status: "active" }) };
}

async function verifyOrRepairWorkspaceOwner(env, tenantId, tenantData, clientAdminUid) {
  const users = await listWorkspaceUsers(env, tenantId);
  const admins = users.filter((user) => String(user.role || "").toLowerCase() === "client_admin");
  const unexpected = users.filter((user) => !["client_admin", "client_user"].includes(String(user.role || "").toLowerCase()));
  if (admins.length !== 1 || admins[0]?.uid !== clientAdminUid || unexpected.length) {
    return { ok: false, error: "Workspace membership does not identify this account as its sole Client Admin." };
  }
  const ownerUid = String(tenantData.ownerUid || "");
  if (ownerUid !== clientAdminUid) {
    const oldOwner = ownerUid ? await getProfile(env, ownerUid) : null;
    if (oldOwner && String(oldOwner.tenantId || "") === tenantId) {
      return { ok: false, error: "Another account is still assigned as this workspace owner." };
    }
    await putDocument(env, `/tenants/${encodeURIComponent(tenantId)}`, {
      ownerUid: clientAdminUid, ownerUidRecoveredAt: new Date().toISOString(),
    });
  }
  return { ok: true, users, tenantData: { ...tenantData, ownerUid: clientAdminUid } };
}

async function updateTenantStatus(env, tenantId, status, actorUid) {
  await putDocument(env, `/tenants/${encodeURIComponent(tenantId)}`, {
    status, updatedAt: new Date().toISOString(), updatedBy: actorUid,
  });
}

async function cascadeClientAdminAction(env, actor, target, action) {
  const tenantId = String(target.tenantId || "").trim();
  if (!tenantId) return;
  const tenant = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`).catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  if (!tenant) return;
  const suspend = ["deny", "block"].includes(action);
  const tenantStatus = String(decodeFields(tenant.fields || {}).status || "active");
  if (!suspend && ["offboarding", "offboarded"].includes(tenantStatus)) {
    throw new Error("This workspace is being removed or has already been removed and cannot be restored.");
  }
  if (suspend) await updateTenantStatus(env, tenantId, "blocked", actor.uid);
  const users = await listWorkspaceUsers(env, tenantId);
  for (const user of users) {
    if (user.uid === target.uid || String(user.role || "").toLowerCase() !== "client_user") continue;
    if (suspend && user.status === "approved" && user.subscriptionStatus === "active") {
      await authUpdate(env, user.uid, { disableUser: true });
      await patchUser(env, user.uid, {
        status: "blocked", subscriptionStatus: "inactive", workspaceSuspended: true,
        updatedBy: actor.uid, updatedAt: new Date().toISOString(),
      });
    } else if (!suspend && user.workspaceSuspended === true) {
      await authUpdate(env, user.uid, { disableUser: false });
      await patchUser(env, user.uid, {
        status: "approved", subscriptionStatus: "active", workspaceSuspended: false,
        updatedBy: actor.uid, updatedAt: new Date().toISOString(),
      });
    }
  }
  await updateTenantStatus(env, tenantId, suspend ? "blocked" : "active", actor.uid);
}

export async function purgeTenantSupportText(env, tenantId, users) {
  await supportMedia.purgeTenant(env,tenantId);
  const threads=await supportMedia.conversations(env,tenantId);
  const owners=[...new Map([...users,...threads.map(document=>({uid:document.name.split('/').at(-1)}))].map(user=>[user.uid,user])).values()];
  for (const user of owners) {
    const uid = String(user.uid || "");
    if (!uid || uid.length > 128) throw new Error("Invalid support conversation owner.");
    const path = `/supportConversations/${encodeURIComponent(uid)}`;
    const conversation = await firestoreRequest(env, path).catch(error => error.status === 404 ? null : Promise.reject(error));
    if (conversation && decodeFields(conversation.fields || {}).tenantId !== tenantId) throw new Error("Support conversation tenant mismatch; cleanup stopped.");
    // Delete children before their parent. Repeating this after a partial failure
    // resumes from the remaining messages without touching another tenant.
    for (let batch = 0; batch < 40; batch++) {
      const listing = await firestoreRequest(env, `${path}/messages?pageSize=50`);
      const messages = listing.documents || [];
      if (!messages.length) break;
      for (const message of messages) {
        if (!message.name?.startsWith(`${firestoreDocumentName(env, path)}/messages/`)) throw new Error("Unexpected support message path.");
        if (decodeFields(message.fields || {}).tenantId !== tenantId) throw new Error("Support message tenant mismatch; cleanup stopped.");
      }
      await firestoreRequest(env,':commit',{method:'POST',body:JSON.stringify({writes:messages.map(message=>({delete:message.name}))})});
      if (batch === 39) throw new Error("Support text cleanup is incomplete; the workspace remains blocked for retry.");
    }
    if (conversation) await firestoreRequest(env, path, { method: "DELETE" });
  }
  if((await supportMedia.conversations(env,tenantId)).length)throw new Error('Support conversation cleanup is incomplete; the workspace remains blocked for retry.');
}

async function deleteClientWorkspace(env, actor, uid, tenantHint = "") {
  if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can remove a client workspace." }, 403);
  if (!uid || uid.length > 128 || uid === actor.uid) return json({ error: "Select a valid Client Admin account." }, 400);
  const profile = await getProfile(env, uid);
  if (!profile && /^[a-zA-Z0-9_-]{1,128}$/.test(tenantHint)) {
    const pending=await licenseDoc(env,`/tenants/${tenantHint}`);
    const data=licenseFields(pending);
    if(data.ownerUid===uid && data.status==="offboarding") {
      const users=await listWorkspaceUsers(env,tenantHint);
      if(users.some(user=>!["client_admin","client_user"].includes(String(user.role||"").toLowerCase())))return json({error:"Unexpected workspace role; no accounts were changed."},409);
      await purgeTenantSupportText(env,tenantHint,users);
      await purgeTenantPushDevices(env,tenantHint);
      for(const user of users){await authDelete(env,user.uid).catch(error=>{if(error.status!==404&&error.status!==400)throw error;});await firestoreRequest(env,`/users/${encodeURIComponent(user.uid)}`,{method:"DELETE"}).catch(error=>{if(error.status!==404)throw error;});}
      await updateTenantStatus(env,tenantHint,"offboarded",actor.uid);
      return json({success:true,message:"Interrupted workspace offboarding completed. Client-owned Google files were kept."});
    }
  }
  if (!profile || String(profile.role || "").toLowerCase() !== "client_admin" || !profile.tenantId) {
    return json({ error: "Select a Client Admin with an assigned workspace." }, 404);
  }
  const tenantId = String(profile.tenantId);
  const tenantDocument = await firestoreRequest(env, `/tenants/${encodeURIComponent(tenantId)}`).catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  if (!tenantDocument) {
    const orphanUsers = await listWorkspaceUsers(env, tenantId);
    const admins = orphanUsers.filter((user) => String(user.role || "").toLowerCase() === "client_admin");
    const unexpected = orphanUsers.filter((user) => !["client_admin", "client_user"].includes(String(user.role || "").toLowerCase()));
    if (admins.length !== 1 || admins[0]?.uid !== uid || unexpected.length) {
      return json({ error: "The workspace record is missing and its users cannot be safely identified. No accounts were changed." }, 409);
    }
    // The tenant document is already missing. Remove only its sole Client
    // Admin and assigned client users, retaining any Google Drive files.
    await putDocument(env, `/tenantSettings/${encodeURIComponent(tenantId)}`, {
      tenantId, accessRevoked: true, offboardedAt: new Date().toISOString(), offboardedBy: actor.uid,
    });
    for (const user of orphanUsers) {
      await authUpdate(env, user.uid, { disableUser: true });
      await patchUser(env, user.uid, {
        status: "blocked", subscriptionStatus: "inactive", updatedBy: actor.uid, updatedAt: new Date().toISOString(),
      });
    }
    await purgeTenantSupportText(env, tenantId, orphanUsers);
    await purgeTenantPushDevices(env, tenantId);
    for (const user of orphanUsers) {
      await authDelete(env, user.uid);
      await firestoreRequest(env, `/users/${encodeURIComponent(user.uid)}`, { method: "DELETE" }).catch((error) => {
        if (error.status !== 404) throw error;
      });
    }
    return json({ success: true, message: "Orphaned Client Admin account and workspace access removed. Any Google Drive files were kept." });
  }

  const ownership = await verifyOrRepairWorkspaceOwner(env, tenantId, decodeFields(tenantDocument.fields || {}), uid);
  if (!ownership.ok) return json({ error: `${ownership.error} No accounts were changed.` }, 409);
  const users = ownership.users;

  // Lock first. If any later revocation fails, the workspace remains closed for retry.
  await updateTenantStatus(env, tenantId, "offboarding", actor.uid);
  await putDocument(env, `/tenantSettings/${encodeURIComponent(tenantId)}`, {
    accessRevoked: true, offboardedAt: new Date().toISOString(), offboardedBy: actor.uid,
  });
  const managed = users;
  for (const user of managed) {
    await authUpdate(env, user.uid, { disableUser: true });
    await patchUser(env, user.uid, {
      status: "blocked", subscriptionStatus: "inactive", updatedBy: actor.uid, updatedAt: new Date().toISOString(),
    });
  }
  await purgeTenantSupportText(env, tenantId, managed);
  await purgeTenantPushDevices(env, tenantId);
  for (const user of managed) {
    await authDelete(env, user.uid);
    await firestoreRequest(env, `/users/${encodeURIComponent(user.uid)}`, { method: "DELETE" }).catch((error) => {
      if (error.status !== 404) throw error;
    });
  }
  await updateTenantStatus(env, tenantId, "offboarded", actor.uid);
  return json({ success: true, message: "Client workspace access removed. The client's Google Drive files were kept." });
}

async function handleDeleteClientWorkspace(request, env, actor) {
  const body = await request.json().catch(() => ({}));
  return deleteClientWorkspace(env, actor, String(body.uid || "").trim(), String(body.tenantId || "").trim());
}

function canManage(actor, target) {
  const actorRole = String(actor.role || "").toLowerCase();
  const targetRole = String(target.role || "user").toLowerCase();
  if (["master_owner", "admin"].includes(actorRole)) {
    return targetRole !== "master_owner" && targetRole !== "admin";
  }
  return actorRole === "client_admin" && targetRole === "client_user"
    && Boolean(actor.tenantId) && actor.tenantId === target.tenantId;
}

async function handleAccountAction(request, env, actor, deleting) {
  const body = await request.json().catch(() => ({}));
  const uid = String(body.uid || "").trim();
  if (!uid || uid.length > 128) return json({ error: "Select a valid account." }, 400);
  if (uid === actor.uid) return json({ error: "You cannot change your own account." }, 400);
  const actorRole = String(actor.profile.role || "").toLowerCase();
  if (deleting && !["master_owner", "admin"].includes(actorRole)) {
    return json({ error: "Only the Master Admin can delete accounts." }, 403);
  }
  const target = await getProfile(env, uid);
  if (!target && deleting && body.tenantId) return deleteClientWorkspace(env,actor,uid,String(body.tenantId).trim());
  if (!target) return json({ error: "The account no longer exists." }, 404);
  if (!canManage(actor.profile, target)) return json({ error: "You cannot manage this account." }, 403);
  const targetRole = String(target.role || "user").toLowerCase();
  if (deleting && targetRole === "client_admin") {
    return deleteClientWorkspace(env, actor, uid);
  }
  if (deleting) {
    await patchUser(env, uid, { status: "blocked", subscriptionStatus: "inactive" });
    await authDelete(env, uid);
    await firestoreRequest(env, `/users/${encodeURIComponent(uid)}`, { method: "DELETE" });
    return json({ success: true, message: "Account deleted." });
  }

  const action = String(body.action || "");
  const map = {
    approve: { status: "approved", subscriptionStatus: "active", disabled: false },
    deny: { status: "denied", subscriptionStatus: "inactive", disabled: true },
    block: { status: "blocked", subscriptionStatus: "inactive", disabled: true },
    unblock: { status: "approved", subscriptionStatus: "active", disabled: false },
  };
  const next = map[action];
  if (!next) return json({ error: "Unknown account action." }, 400);
  if (targetRole === "client_admin" && ["approve", "deny", "block", "unblock"].includes(action)) {
    await cascadeClientAdminAction(env, actor, { ...target, uid }, action);
  }
  await authUpdate(env, uid, { disableUser: next.disabled });
  await patchUser(env, uid, {
    status: next.status,
    subscriptionStatus: next.subscriptionStatus,
    updatedBy: actor.uid,
    updatedAt: new Date().toISOString(),
  });
  return json({ success: true, message: `Account ${action} successful.` });
}

let cachedLicensePublicKey;
export const supportMedia=createSupportMediaService({request:firestoreRequest,decode:decodeFields,encode:encodeFields,name:firestoreDocumentName,isMaster:actor=>isMasterActor(actor)||actor.profile.role==='master_admin'});
async function handleSupportMedia(request,env,actor,route){
  try{
    const size=Number(request.headers.get('content-length')||0);if(size>3000000)return json({error:'Support attachment is too large.'},413);
    const reader=request.body?.getReader(),parts=[];let bytes=0;
    if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>3000000){await reader.cancel();return json({error:'Support attachment is too large.'},413);}parts.push(next.value);}
    const raw=new Uint8Array(bytes);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.byteLength;}
    let body;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{return json({error:'Invalid support request.'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid support request.'},400);
    const action={'/support-message-send':'text','/support-media-send':'send','/support-media-read':'read','/support-media-delete':'remove','/support-media-reply':'reply'}[route];
    const result=await supportMedia[action](env,actor,body);
    if(['text','send','reply'].includes(action))await sendSupportPush(env,actor,result);
    return json(result,200,{'cache-control':'private, no-store'});
  }catch(error){return json({error:error instanceof Error?error.message:'Support media request failed.'},error.status||500,{'cache-control':'private, no-store'});}
}

async function deleteSupportConversation(request,env,actor){
  if(!isMasterActor(actor))return json({error:'Only the Master Admin can delete a complete support conversation.'},403);
  const body=await request.json().catch(()=>({})),clientUid=String(body.clientUid||'');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(clientUid))return json({error:'Choose a valid support conversation.'},400);
  const path=`/supportConversations/${encodeURIComponent(clientUid)}`,conversation=await firestoreRequest(env,path).catch(error=>error.status===404?null:Promise.reject(error));
  if(!conversation)return json({success:true,deleted:false});
  const tenantId=String(decodeFields(conversation.fields||{}).tenantId||'');
  if(!tenantId)return json({error:'Support conversation workspace is invalid; deletion stopped.'},409);
  await supportMedia.purgeConversation(env,clientUid);
  for(let batch=0;batch<40;batch++){
    const listing=await firestoreRequest(env,`${path}/messages?pageSize=50`),messages=listing.documents||[];
    if(!messages.length)break;
    for(const message of messages){
      if(!message.name?.startsWith(`${firestoreDocumentName(env,path)}/messages/`)||String(decodeFields(message.fields||{}).tenantId||'')!==tenantId)throw Object.assign(new Error('Support conversation data mismatch; deletion stopped.'),{status:409});
    }
    await firestoreRequest(env,':commit',{method:'POST',body:JSON.stringify({writes:messages.map(message=>({delete:message.name}))})});
    if(batch===39)throw Object.assign(new Error('Support conversation cleanup is incomplete. Retry deletion.'),{status:503});
  }
  await firestoreRequest(env,path,{method:'DELETE'});
  return json({success:true,deleted:true});
}
async function licensePublicKey(env) {
  if (!cachedLicensePublicKey) {
    const signed = await createOfflineSession(env.FIREBASE_SERVICE_ACCOUNT, { purpose: "license-key-discovery" });
    cachedLicensePublicKey = signed.publicKey;
  }
  return cachedLicensePublicKey;
}

export default {
  async scheduled(_event, env) {
    const results=await Promise.allSettled([supportMedia.purgeExpired(env),(async()=>{
      await purgeExpiredPushDevices(env);await purgeExpiredPushArtifacts(env);await deliverScheduledNotices(env);await drainQueuedPush(env);await drainLicenseInquiryEmails(env);
    })()]);
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  },
  async fetch(request, env, context) {
    if (new URL(request.url).pathname === "/license-public-key" && request.method === "GET") {
      try { return json({ publicKey: await licensePublicKey(env), issuer: env.FIREBASE_PROJECT_ID }); }
      catch { return json({ error: "License verification key is unavailable." }, 503); }
    }
    if (new URL(request.url).pathname === "/health" && request.method === "GET") {
      return json({ success: true, protected: true, message: "Bank Setu API is running",licenseEnforcementVersion:2,commit:env.RELEASE_COMMIT||null });
    }
    const origins = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
    const origin = request.headers.get("origin") || "";
    const allowedOrigin=origins.includes(origin) || (env.ALLOW_LOCAL_FIRST_PREVIEW === "true" && /^https:\/\/banksetu-app--local-first-test-[a-z0-9]+\.web\.app$/.test(origin));
    const cors = {
      "access-control-allow-origin": allowedOrigin ? origin : "null",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowedOrigin) return json({ error: "Origin is not allowed." }, 403, cors);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
    const route = new URL(request.url).pathname;
    try {
      const supportedRoutes = [
        "/account-action", "/delete-user", "/create-client-user", "/create-client", "/create-client-invite",
        "/get-google-setup", "/save-google-setup", "/save-client-registration",
        "/bootstrap-master-owner", "/get-offline-session", "/connect-option-b", "/configure-tenant-data", "/save-bank-format-template",
        "/save-bank-format-mapping", "/save-workspace-bank-settings", "/presence-heartbeat", "/master-system-status",
        "/license-public", "/license-inquiry", "/license-me", "/license-my-requests", "/license-admin-settings", "/license-save-settings", "/license-admin-list", "/license-admin-inquiry-status", "/license-admin-history", "/license-admin-assign", "/license-admin-change", "/license-admin-demo", "/license-admin-demo-convert", "/license-request-change", "/license-admin-decision", "/license-admin-email-retry", "/license-admin-delete-request", "/license-admin-state",
        "/push-register", "/push-unregister", "/push-sync-event", "/push-test", "/afsm-confirmation", "/support-message-send", "/support-media-send", "/support-media-read", "/support-media-reply", "/support-conversation-delete",
      ];
      if (!supportedRoutes.includes(route)) {
        return json({ error: "Not found." }, 404, cors);
      }
      let actor;
      if (route === "/license-public" || route === "/license-inquiry") {
        actor = null;
      } else if (route === "/bootstrap-master-owner") {
        const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!idToken) return json({ error: "Sign in is required." }, 401, cors);
        const identity = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }),
        }).then((result) => result.json());
        const user = identity.users?.[0];
        if (!user?.localId) return json({ error: "Your login has expired." }, 401, cors);
        actor = { uid: user.localId, profile: {} };
      } else {
        actor = await verifyActor(request, env);
      }
      if (actor?.error) return new Response(actor.error.body, { status: actor.error.status, headers: { ...Object.fromEntries(actor.error.headers), ...cors } });
      const migratedRoutes = ["/afsm-confirmation", "/create-client", "/create-client-invite", "/get-google-setup", "/save-google-setup", "/save-client-registration", "/bootstrap-master-owner", "/get-offline-session", "/connect-option-b", "/configure-tenant-data", "/save-bank-format-template", "/save-bank-format-mapping", "/save-workspace-bank-settings", "/presence-heartbeat", "/master-system-status"];
      const result = route.startsWith("/license-")
        ? await handleLicensing(request, env, actor, route, context)
        : route === '/support-conversation-delete'
        ? await deleteSupportConversation(request,env,actor)
        : route.startsWith('/support-media-')||route==='/support-message-send'
        ? await handleSupportMedia(request,env,actor,route)
        : route === "/push-test"
        ? await handlePushTest(env,actor)
        : route === "/push-sync-event"
        ? await handleSyncPushEvent(request,env,actor)
        : route.startsWith("/push-")
        ? await handlePushRegistration(request, env, actor, route)
        : migratedRoutes.includes(route)
        ? await handleMasterOperation(request, env, actor, route)
        : route === "/create-client-user"
          ? await createClientUser(request, env, actor)
          : await handleAccountAction(request, env, actor, route === "/delete-user");
      return new Response(result.body, { status: result.status, headers: { ...Object.fromEntries(result.headers), ...cors } });
    } catch (error) {
      console.error("Bank Setu account service error", error);
      return json({ error: error instanceof Error ? error.message : "Account service failed." }, 500, cors);
    }
  },
};
