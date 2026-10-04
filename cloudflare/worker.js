import { parseGoogleResource, validateResourceOwnership } from "./googleConnection.js";
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
  let dataApiReady = false;
  if (apiUrl) {
    try {
      const statusResponse = await fetch(`${apiUrl}?action=status`, { signal: AbortSignal.timeout(8000) });
      const status = await statusResponse.json();
      dataApiReady = statusResponse.ok && status.success === true && status.tenantIsolationVersion === "v2";
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

async function handleMasterOperation(request, env, actor, route) {
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

  if (route === "/create-client") {
    if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can create Client Admin accounts." }, 403);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const bankName = String(body.bankName || "").trim();
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !bankName || bankName.length > 120 || password.length < 8 || password.length > 128) {
      return json({ error: "Enter a valid client name, email, bank name and password (at least 8 characters)." }, 400);
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
      const docs = [
        [firestoreDocumentName(env, `/tenants/${tenantId}`), { tenantId, clientId: tenantId, ownerUid: newUid, bankName, maxUsers: 2, clientUserCount: 0, status: "active", createdAt: now, createdBy: actor.uid }],
        [firestoreDocumentName(env, `/tenantSettings/${tenantId}`), { tenantId, bankName, apiUrl: String(setupData.apiUrl), spreadsheetId: "", photoFolderId: "", bankInfo: {}, bankLogo: "", updatedAt: now, updatedBy: actor.uid }],
        [firestoreDocumentName(env, `/users/${newUid}`), { name, email, role: "client_admin", tenantId, clientId: tenantId, parentClientUid: actor.uid, bankName, maxUsers: 2, status: "approved", subscriptionStatus: "active", createdAt: now, createdBy: actor.uid }],
      ];
      await firestoreRequest(env, ":commit", { method: "POST", body: JSON.stringify({ writes: docs.map(([docName, fields]) => ({ update: { name: docName, fields: encodeFields(fields) }, currentDocument: { exists: false } })) }) });
      return json({ success: true, uid: newUid, tenantId, role: "client_admin" });
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
      operatorName: String(body.operatorName || "").trim(), address: String(body.address || "").trim(),
    };
    if (!registration.bankName || !registration.passbookBank || !registration.branchName || !registration.operatorName || registration.bankName.length > 120 || registration.cspCode.length > 80 || registration.address.length > 500) return json({ error: "Complete the required bank, branch and operator details." }, 400);
    await putDocument(env, `/tenantSettings/${encodeURIComponent(actor.profile.tenantId)}`, { tenantId: actor.profile.tenantId, ...registration, bankInfo: registration, updatedAt: new Date().toISOString(), updatedBy: actor.uid });
    return json({ success: true });
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
      const fields = new Set(["name", "fatherName", "accountNo", "customerId", "aofNo", "gender", "mobile", "aadhaar", "pan", "address", "branchName", "ifsc", "accountOpeningDate", "nominee", "postOffice", "pinCode", "status", "customerPhoto"]);
      const fieldMap = Array.isArray(body.fieldMap) ? body.fieldMap : [];
      if (!formats[formatType]?.fileId || formats[formatType]?.bankKey !== selectedBank || !Number.isFinite(width) || !Number.isFinite(height) || width < 50 || width > 500 || height < 50 || height > 500 || fieldMap.length > 50) return json({ error: "Upload a sample and enter valid page dimensions first." }, 400);
      const normalized = fieldMap.map((item) => ({ field: String(item.field || ""), page: Number(item.page || 1), x: Number(item.x), y: Number(item.y), width: Number(item.width), fontSize: Number(item.fontSize), uppercase: item.uppercase === true, align: String(item.align || "left") }));
      if (normalized.some((item) => ![item.x,item.y,item.width,item.fontSize,item.page].every(Number.isFinite) || !fields.has(item.field) || !["left", "center", "right"].includes(item.align) || item.x < 0 || item.x > 100 || item.y < 0 || item.y > 100 || item.width < 1 || item.width > 100 || item.fontSize < 5 || item.fontSize > 48 || !Number.isInteger(item.page) || item.page < 1 || item.page > 10)) return json({ error: "A mapped field has an invalid key or position." }, 400);
      formats[formatType] = { ...formats[formatType], pageWidthMm: width, pageHeightMm: height, fieldMap: normalized, mappingUpdatedAt: new Date().toISOString(), mappingUpdatedBy: actor.uid };
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

async function deleteClientWorkspace(env, actor, uid) {
  if (!isMasterActor(actor)) return json({ error: "Only the Master Admin can remove a client workspace." }, 403);
  if (!uid || uid.length > 128 || uid === actor.uid) return json({ error: "Select a valid Client Admin account." }, 400);
  const profile = await getProfile(env, uid);
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
  return deleteClientWorkspace(env, actor, String(body.uid || "").trim());
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

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/health" && request.method === "GET") {
      return json({ success: true, protected: true, message: "Bank Setu API is running" });
    }
    const origins = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
    const origin = request.headers.get("origin") || "";
    const cors = {
      "access-control-allow-origin": origins.includes(origin) ? origin : "null",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!origins.includes(origin)) return json({ error: "Origin is not allowed." }, 403, cors);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
    const route = new URL(request.url).pathname;
    try {
      const supportedRoutes = [
        "/account-action", "/delete-user", "/create-client-user", "/create-client",
        "/get-google-setup", "/save-google-setup", "/save-client-registration",
        "/bootstrap-master-owner", "/connect-option-b", "/configure-tenant-data", "/save-bank-format-template",
        "/save-bank-format-mapping", "/save-workspace-bank-settings",
      ];
      if (!supportedRoutes.includes(route)) {
        return json({ error: "Not found." }, 404, cors);
      }
      let actor;
      if (route === "/bootstrap-master-owner") {
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
      if (actor.error) return new Response(actor.error.body, { status: actor.error.status, headers: { ...Object.fromEntries(actor.error.headers), ...cors } });
      const migratedRoutes = ["/create-client", "/get-google-setup", "/save-google-setup", "/save-client-registration", "/bootstrap-master-owner", "/connect-option-b", "/configure-tenant-data", "/save-bank-format-template", "/save-bank-format-mapping", "/save-workspace-bank-settings"];
      const result = migratedRoutes.includes(route)
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
