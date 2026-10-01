import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();
const auth = getAuth();

interface UserActionData {
  uid: string;
}

interface CreateClientData {
  name: string;
  email: string;
  password: string;
  bankName: string;
}

interface CreateClientUserData {
  name: string;
  email: string;
  password: string;
}

type ProvisioningRole = "master_owner" | "client_admin";
const MASTER_OWNER_EMAIL = "banksetu2026@gmail.com";

async function requireProvisioningRole(
  uid: string | undefined,
  allowedRoles: ProvisioningRole[]
): Promise<{ uid: string; role: ProvisioningRole; tenantId?: string }> {
  if (!uid) throw new HttpsError("unauthenticated", "Please login first.");
  const snapshot = await db.collection("users").doc(uid).get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    !allowedRoles.includes(data?.role as ProvisioningRole) ||
    data?.status !== "approved" ||
    data?.subscriptionStatus !== "active"
  ) {
    throw new HttpsError("permission-denied", "You are not allowed to provision accounts.");
  }
  return {
    uid,
    role: data.role as ProvisioningRole,
    tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined,
  };
}

function validateProvisioningInput(input: {
  name: unknown;
  email: unknown;
  password: unknown;
}): { name: string; email: string; password: string } {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!name || name.length > 100) {
    throw new HttpsError("invalid-argument", "Enter a valid name.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Password must be 8 to 128 characters.");
  }
  return { name, email, password };
}

async function rollbackProvisionedAccount(uid: string, tenantId?: string): Promise<void> {
  await Promise.allSettled([
    auth.deleteUser(uid),
    db.collection("users").doc(uid).delete(),
    ...(tenantId
      ? [
          db.collection("tenantSettings").doc(tenantId).delete(),
          db.collection("tenants").doc(tenantId).delete(),
        ]
      : []),
  ]);
}

export const createClient = onCall<CreateClientData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["master_owner"]);
  const googleSetup = (await db.collection("appSettings").doc("googleSetup").get()).data() || {};
  if (!googleSetup.oauthClientId || !googleSetup.apiUrl || !googleSetup.executorEmail) {
    throw new HttpsError("failed-precondition", "Complete the one-time Bank Setu Google setup before creating client accounts.");
  }
  const { name, email, password } = validateProvisioningInput(request.data || {});
  const bankName = String(request.data?.bankName || "").trim();
  if (!bankName || bankName.length > 120) {
    throw new HttpsError("invalid-argument", "Enter a valid bank name.");
  }

  let newUid: string | undefined;
  let tenantId: string | undefined;
  try {
    const account = await auth.createUser({ email, password, displayName: name });
    newUid = account.uid;
    tenantId = db.collection("tenants").doc().id;
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.collection("tenants").doc(tenantId), {
      tenantId,
      clientId: tenantId,
      ownerUid: newUid,
      bankName,
      maxUsers: 2,
      clientUserCount: 0,
      status: "active",
      createdAt: now,
      createdBy: actor.uid,
    });
    batch.set(db.collection("tenantSettings").doc(tenantId), {
      tenantId,
      bankName,
      apiUrl: String(googleSetup.apiUrl),
      spreadsheetId: "",
      photoFolderId: "",
      bankInfo: {},
      bankLogo: "",
      updatedAt: now,
      updatedBy: actor.uid,
    });
    batch.set(db.collection("users").doc(newUid), {
      name,
      email,
      role: "client_admin",
      tenantId,
      clientId: tenantId,
      parentClientUid: actor.uid,
      bankName,
      maxUsers: 2,
      status: "approved",
      subscriptionStatus: "active",
      createdAt: now,
      createdBy: actor.uid,
    });
    await batch.commit();
    return { success: true, uid: newUid, tenantId, role: "client_admin" };
  } catch (error: unknown) {
    if (newUid) await rollbackProvisionedAccount(newUid, tenantId);
    const firebaseError = error as { code?: string };
    if (firebaseError.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account already uses this email.");
    }
    if (error instanceof HttpsError) throw error;
    console.error("Client provisioning failed:", error);
    throw new HttpsError("internal", "Unable to create the client account.");
  }
});

/** One-time recovery-safe owner bootstrap for the verified Bank Setu owner email. */
export const bootstrapMasterOwner = onCall(async (request) => {
  const uid = request.auth?.uid;
  const email = String(request.auth?.token.email || "").trim().toLowerCase();
  const emailVerified = request.auth?.token.email_verified === true;
  if (!uid || email !== MASTER_OWNER_EMAIL || !emailVerified) {
    throw new HttpsError("permission-denied", "Only the verified Bank Setu owner account can bootstrap the first Master Admin.");
  }
  const profileRef = db.collection("users").doc(uid);
  await db.runTransaction(async (transaction) => {
    const ownerQuery = db.collection("users").where("role", "==", "master_owner").limit(1);
    const [owners, profile] = await Promise.all([
      transaction.get(ownerQuery),
      transaction.get(profileRef),
    ]);
    if (!owners.empty) throw new HttpsError("already-exists", "A Master Admin account is already configured.");
    if (profile.exists && profile.data()?.role && profile.data()?.role !== "admin") {
      throw new HttpsError("failed-precondition", "This Bank Setu account already has a different application role.");
    }
    const name = String(request.auth?.token.name || profile.data()?.name || "Bank Setu Owner").trim();
    transaction.set(profileRef, {
      name,
      email,
      role: "master_owner",
      status: "approved",
      subscriptionStatus: "active",
      masterOwnerBootstrappedAt: FieldValue.serverTimestamp(),
      ...(profile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });
  return { success: true, role: "master_owner" };
});

export const createClientUser = onCall<CreateClientUserData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["client_admin"]);
  if (!actor.tenantId) {
    throw new HttpsError("failed-precondition", "Client account has no tenant assignment.");
  }
  const { name, email, password } = validateProvisioningInput(request.data || {});
  const tenantRef = db.collection("tenants").doc(actor.tenantId);
  const tenantSnapshot = await tenantRef.get();
  if (!tenantSnapshot.exists || tenantSnapshot.data()?.status !== "active") {
    throw new HttpsError("failed-precondition", "This client workspace is not active.");
  }
  await db.runTransaction(async (transaction) => {
    const freshTenant = await transaction.get(tenantRef);
    if (!freshTenant.exists || freshTenant.data()?.status !== "active") {
      throw new HttpsError("failed-precondition", "This client workspace is not active.");
    }
    const usedSeats = Number(freshTenant.data()?.clientUserCount || 0);
    const currentLimit = Number(freshTenant.data()?.maxUsers || 2);
    if (usedSeats >= currentLimit) {
      throw new HttpsError("resource-exhausted", `This workspace allows ${currentLimit} client users.`);
    }
    transaction.update(tenantRef, { clientUserCount: usedSeats + 1 });
  });
  let newUid: string | undefined;
  try {
    const account = await auth.createUser({ email, password, displayName: name });
    newUid = account.uid;
    await db.collection("users").doc(newUid).set({
      name,
      email,
      role: "client_user",
      tenantId: actor.tenantId,
      clientId: actor.tenantId,
      parentClientUid: actor.uid,
      bankName: tenantSnapshot.data()?.bankName || "",
      status: "approved",
      subscriptionStatus: "active",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
    });
    return { success: true, uid: newUid, tenantId: actor.tenantId, role: "client_user" };
  } catch (error: unknown) {
    if (newUid) await rollbackProvisionedAccount(newUid);
    await tenantRef.update({ clientUserCount: FieldValue.increment(-1) }).catch(() => undefined);
    const firebaseError = error as { code?: string };
    if (firebaseError.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account already uses this email.");
    }
    if (error instanceof HttpsError) throw error;
    console.error("Client user provisioning failed:", error);
    throw new HttpsError("internal", "Unable to create the client user.");
  }
});

interface OffboardClientData {
  uid: string;
}

/**
 * Retire a client workspace without deleting its Google Sheet or Drive data.
 * Profiles are disabled before Authentication accounts are removed, so a
 * partial failure still leaves the tenant inaccessible and can be retried.
 */
export const offboardClient = onCall<OffboardClientData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["master_owner"]);
  const clientAdminUid = String(request.data?.uid || "").trim();
  if (!clientAdminUid || clientAdminUid === actor.uid) {
    throw new HttpsError("invalid-argument", "Choose a valid client administrator.");
  }

  const clientAdminRef = db.collection("users").doc(clientAdminUid);
  const clientAdminSnapshot = await clientAdminRef.get();
  const clientAdmin = clientAdminSnapshot.data();
  if (!clientAdminSnapshot.exists || clientAdmin?.role !== "client_admin") {
    throw new HttpsError("not-found", "Client administrator was not found.");
  }
  const tenantId = String(clientAdmin.tenantId || "").trim();
  if (!tenantId) {
    throw new HttpsError("failed-precondition", "Client administrator has no tenant assignment.");
  }

  const tenantRef = db.collection("tenants").doc(tenantId);
  const tenantSnapshot = await tenantRef.get();
  if (!tenantSnapshot.exists || tenantSnapshot.data()?.ownerUid !== clientAdminUid) {
    throw new HttpsError("failed-precondition", "Client workspace ownership does not match this account.");
  }

  const tenantUsers = await db.collection("users").where("tenantId", "==", tenantId).get();
  const accounts = tenantUsers.docs.map((snapshot) => ({
    ref: snapshot.ref,
    uid: snapshot.id,
    role: String(snapshot.data().role || ""),
  }));
  if (accounts.some((account) => !["client_admin", "client_user"].includes(account.role))) {
    throw new HttpsError("failed-precondition", "Workspace contains an unexpected account role; review it before offboarding.");
  }
  if (!accounts.some((account) => account.uid === clientAdminUid && account.role === "client_admin")) {
    throw new HttpsError("failed-precondition", "Client administrator is not assigned to this workspace.");
  }

  const now = FieldValue.serverTimestamp();
  const blockBatch = db.batch();
  blockBatch.update(tenantRef, {
    status: "offboarded",
    clientUserCount: 0,
    offboardedAt: now,
    offboardedBy: actor.uid,
    previousOwnerUid: clientAdminUid,
    ownerUid: FieldValue.delete(),
  });
  for (const account of accounts) {
    blockBatch.update(account.ref, {
      status: "blocked",
      subscriptionStatus: "inactive",
      offboardedAt: now,
      offboardedBy: actor.uid,
    });
  }
  await blockBatch.commit();

  try {
    await Promise.all(accounts.map((account) => auth.updateUser(account.uid, { disabled: true })));
  } catch (error: unknown) {
    console.error("Client offboarding account disable failed:", error);
    throw new HttpsError("internal", "Workspace access has been blocked, but account cleanup must be retried.");
  }

  for (const account of accounts) {
    try {
      await auth.deleteUser(account.uid);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code !== "auth/user-not-found") {
        console.error("Client offboarding account delete failed:", error);
        throw new HttpsError("internal", "Workspace access has been blocked, but account cleanup must be retried.");
      }
    }
  }

  const deleteBatch = db.batch();
  for (const account of accounts) deleteBatch.delete(account.ref);
  await deleteBatch.commit();

  return {
    success: true,
    tenantId,
    accountsRemoved: accounts.length,
    dataPreserved: true,
    message: "Client access was removed. Google Sheet and Drive data were preserved.",
  };
});

async function requireAdmin(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please login first.");
  }

  const adminDoc = await db.collection("users").doc(uid).get();

  if (!adminDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Administrator record not found."
    );
  }

  const adminData = adminDoc.data();

  if (
    !["admin", "master_owner", "client_admin"].includes(String(adminData?.role)) ||
    adminData?.status !== "approved" ||
    adminData?.subscriptionStatus !== "active"
  ) {
    throw new HttpsError(
      "permission-denied",
      "Only administrator can perform this action."
    );
  }
}

async function requireCanManageUser(
  actorUid: string | undefined,
  targetData: FirebaseFirestore.DocumentData
): Promise<void> {
  if (!actorUid) throw new HttpsError("unauthenticated", "Please login first.");
  const actorSnapshot = await db.collection("users").doc(actorUid).get();
  const actor = actorSnapshot.data();
  if (!actorSnapshot.exists || !actor) {
    throw new HttpsError("permission-denied", "Administrator record not found.");
  }
  if (targetData.role === "master_owner") {
    throw new HttpsError("permission-denied", "Master Owner accounts are protected.");
  }
  if (actor.role === "master_owner" || actor.role === "admin") return;
  if (
    actor.role === "client_admin" &&
    typeof actor.tenantId === "string" &&
    actor.tenantId === targetData.tenantId &&
    targetData.role === "client_user"
  ) return;
  throw new HttpsError("permission-denied", "You cannot manage users outside your workspace.");
}

function getTargetUid(request: CallableRequest<UserActionData>): string {
  const uid = String(request.data?.uid || "").trim();

  if (!uid) {
    throw new HttpsError("invalid-argument", "User UID is required.");
  }

  if (uid === request.auth?.uid) {
    throw new HttpsError(
      "failed-precondition",
      "Administrator cannot perform this action on own account."
    );
  }

  return uid;
}

/* =========================================
   APPROVE USER
========================================= */

export const approveUser = onCall<UserActionData>(
  async (request: CallableRequest<UserActionData>) => {
    await requireAdmin(request.auth?.uid);

    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User record not found.");
    }
    await requireCanManageUser(request.auth?.uid, userDoc.data() || {});

    await auth.updateUser(uid, { disabled: false });

    await userRef.update({
      status: "approved",
      subscriptionStatus: "active",
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: request.auth?.uid,
    });

    return {
      success: true,
      message: "User approved successfully.",
    };
  }
);

/* =========================================
   BLOCK USER
========================================= */

export const blockUser = onCall<UserActionData>(
  async (request: CallableRequest<UserActionData>) => {
    await requireAdmin(request.auth?.uid);

    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User record not found.");
    }
    await requireCanManageUser(request.auth?.uid, userDoc.data() || {});

    await auth.updateUser(uid, { disabled: true });

    await userRef.update({
      status: "blocked",
      subscriptionStatus: "inactive",
      blockedAt: FieldValue.serverTimestamp(),
      blockedBy: request.auth?.uid,
    });

    return {
      success: true,
      message: "User blocked successfully.",
    };
  }
);

/* =========================================
   UNBLOCK USER
========================================= */

export const unblockUser = onCall<UserActionData>(
  async (request: CallableRequest<UserActionData>) => {
    await requireAdmin(request.auth?.uid);

    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User record not found.");
    }
    await requireCanManageUser(request.auth?.uid, userDoc.data() || {});

    await auth.updateUser(uid, { disabled: false });

    await userRef.update({
      status: "approved",
      subscriptionStatus: "active",
      unblockedAt: FieldValue.serverTimestamp(),
      unblockedBy: request.auth?.uid,
    });

    return {
      success: true,
      message: "User unblocked successfully.",
    };
  }
);

/* =========================================
   DELETE USER
========================================= */

export const deleteUser = onCall<UserActionData>(
  async (request: CallableRequest<UserActionData>) => {
    await requireAdmin(request.auth?.uid);

    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User record not found.");
    const targetData = userDoc.data() || {};
    await requireCanManageUser(request.auth?.uid, targetData);
    const actorSnapshot = await db.collection("users").doc(request.auth!.uid).get();
    if (actorSnapshot.data()?.role === "client_admin" && targetData.role === "client_user") {
      throw new HttpsError("permission-denied", "Client Admins can manage client users but cannot delete them.");
    }
    if (["client_admin", "master_owner"].includes(String(targetData.role))) {
      throw new HttpsError("failed-precondition", "Client administrator accounts require tenant-safe offboarding.");
    }

    try {
      await auth.deleteUser(uid);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };

      if (firebaseError.code !== "auth/user-not-found") {
        console.error("Authentication delete error:", error);
        throw new HttpsError(
          "internal",
          "Unable to delete Authentication account."
        );
      }
    }

    await userRef.delete();
    if (targetData.role === "client_user" && typeof targetData.tenantId === "string") {
      await db.collection("tenants").doc(targetData.tenantId)
        .update({ clientUserCount: FieldValue.increment(-1) })
        .catch((error: unknown) => console.error("Tenant user count update failed:", error));
    }

    return {
      success: true,
      message: "User deleted successfully.",
    };
  }
);

/* =========================================
   DENY USER
========================================= */
export const denyUser = onCall<UserActionData>(
  async (request: CallableRequest<UserActionData>) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User record not found.");
    await requireCanManageUser(request.auth?.uid, userDoc.data() || {});
    await auth.updateUser(uid, { disabled: true });
    await userRef.update({
      status: "denied",
      subscriptionStatus: "inactive",
      deniedAt: FieldValue.serverTimestamp(),
      deniedBy: request.auth?.uid,
});
    return { success: true, message: "User denied successfully." };
  }
);

interface ConfigureTenantData {
  tenantId: string;
  spreadsheetId: string;
  photoFolderId: string;
  apiUrl: string;
  googleEmail?: string;
  accessToken?: string;
}

async function verifyGoogleWorkspaceOwnership(
  accessToken: string,
  spreadsheetId: string,
  photoFolderId: string,
  expectedExecutorEmail: string,
  suppliedEmail: string
): Promise<string> {
  if (accessToken.length < 20 || accessToken.length > 8192) {
    throw new HttpsError("invalid-argument", "Reconnect Google Drive and try again.");
  }
  const headers = { Authorization: `Bearer ${accessToken}` };
  const getGoogleJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { headers });
    const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
    if (!response.ok) {
      console.warn("Google workspace verification failed with status:", response.status);
      throw new HttpsError("failed-precondition", "Google could not verify the workspace. Reconnect your Google account and retry.");
    }
    return result;
  };
  const encodedFields = encodeURIComponent("id,mimeType,owners(emailAddress),parents,trashed");
  const [profile, sheet, folder] = await Promise.all([
    getGoogleJson<{ email?: string }>("https://www.googleapis.com/oauth2/v2/userinfo"),
    getGoogleJson<{ id?: string; mimeType?: string; owners?: Array<{ emailAddress?: string }>; parents?: string[]; trashed?: boolean }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=${encodedFields}`
    ),
    getGoogleJson<{ id?: string; mimeType?: string; owners?: Array<{ emailAddress?: string }>; trashed?: boolean }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photoFolderId)}?fields=${encodedFields}`
    ),
  ]);
  const email = String(profile.email || "").trim().toLowerCase();
  const spreadsheetOwner = String(sheet.owners?.[0]?.emailAddress || "").trim().toLowerCase();
  const folderOwner = String(folder.owners?.[0]?.emailAddress || "").trim().toLowerCase();
  if (!email || email !== suppliedEmail.toLowerCase() || spreadsheetOwner !== email || folderOwner !== email) {
    throw new HttpsError("permission-denied", "The Google Sheet and Drive folder must belong to the Google account you connected.");
  }
  if (sheet.id !== spreadsheetId || sheet.mimeType !== "application/vnd.google-apps.spreadsheet" || sheet.trashed || !sheet.parents?.includes(photoFolderId)) {
    throw new HttpsError("invalid-argument", "The Google Sheet must be inside the new Bank Setu workspace folder.");
  }
  if (folder.id !== photoFolderId || folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
    throw new HttpsError("invalid-argument", "The Bank Setu Drive folder is not valid.");
  }
  const permissionList = await getGoogleJson<{ permissions?: Array<{ emailAddress?: string; role?: string }> }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photoFolderId)}/permissions?fields=permissions(emailAddress,role)`
  );
  const executorPermission = permissionList.permissions?.find((permission) =>
    String(permission.emailAddress || "").toLowerCase() === expectedExecutorEmail.toLowerCase()
  );
  if (!executorPermission || !["writer", "owner"].includes(String(executorPermission.role))) {
    throw new HttpsError("failed-precondition", "The workspace folder has not been shared with the Bank Setu Apps Script account.");
  }
  return email;
}

export const configureTenantData = onCall<ConfigureTenantData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["master_owner", "client_admin"]);
  const tenantId = String(request.data?.tenantId || "").trim();
  const spreadsheetId = String(request.data?.spreadsheetId || "").trim();
  const photoFolderId = String(request.data?.photoFolderId || "").trim();
  const suppliedApiUrl = String(request.data?.apiUrl || "").trim();
  const googleEmail = String(request.data?.googleEmail || "").trim().toLowerCase();
  const accessToken = String(request.data?.accessToken || "").trim();
  if (!tenantId || tenantId.length > 128) {
    throw new HttpsError("invalid-argument", "Choose a valid client workspace.");
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new HttpsError("invalid-argument", "Enter the Google Sheet ID, not its full URL.");
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(photoFolderId)) {
    throw new HttpsError("invalid-argument", "Enter the Google Drive folder ID.");
  }
  if (googleEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(googleEmail) || googleEmail.length > 254)) {
    throw new HttpsError("invalid-argument", "Google account email is invalid.");
  }
  if (actor.role === "client_admin" && actor.tenantId !== tenantId) {
    throw new HttpsError("permission-denied", "You can only connect your own client workspace.");
  }
  const tenantRef = db.collection("tenants").doc(tenantId);
  const tenant = await tenantRef.get();
  if (!tenant.exists || tenant.data()?.status !== "active") {
    throw new HttpsError("not-found", "Active client workspace not found.");
  }
  const setupRef = db.collection("appSettings").doc("googleSetup");
  const setupSnap = await setupRef.get();
  const configuredApiUrl = String(setupSnap.data()?.apiUrl || "").trim();
  const apiUrl = actor.role === "master_owner" ? suppliedApiUrl : configuredApiUrl;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl)) {
    throw new HttpsError("failed-precondition", "Bank Setu Google setup is not complete yet.");
  }
  const setupData = setupSnap.data() || {};
  if (actor.role === "client_admin" && !setupData.executorEmail) {
    throw new HttpsError("failed-precondition", "Bank Setu Google setup is not complete yet.");
  }
  const verifiedGoogleEmail = actor.role === "client_admin"
    ? await verifyGoogleWorkspaceOwnership(
      accessToken,
      spreadsheetId,
      photoFolderId,
      String(setupData.executorEmail || ""),
      googleEmail
    )
    : googleEmail;
  await db.collection("tenantSettings").doc(tenantId).set({
    tenantId,
    bankName: tenant.data()?.bankName || "",
    apiUrl,
    spreadsheetId,
    photoFolderId,
    ...(verifiedGoogleEmail ? { googleEmail: verifiedGoogleEmail } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  }, { merge: true });
  return { success: true, tenantId };
});

interface GoogleSetupConfig {
  oauthClientId: string;
  apiUrl: string;
  executorEmail: string;
}

function validateGoogleSetupConfig(input: GoogleSetupConfig): GoogleSetupConfig {
  const oauthClientId = String(input.oauthClientId || "").trim();
  const apiUrl = String(input.apiUrl || "").trim();
  const executorEmail = String(input.executorEmail || "").trim().toLowerCase();
  if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(oauthClientId)) {
    throw new HttpsError("invalid-argument", "Enter a valid Google OAuth Web Client ID.");
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl)) {
    throw new HttpsError("invalid-argument", "Enter a valid Apps Script Web App URL ending in /exec.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(executorEmail) || executorEmail.length > 254) {
    throw new HttpsError("invalid-argument", "Enter the Google account that owns the Apps Script deployment.");
  }
  return { oauthClientId, apiUrl, executorEmail };
}

export const saveGoogleSetupConfig = onCall<GoogleSetupConfig>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["master_owner"]);
  const config = validateGoogleSetupConfig(request.data || {});
  await db.collection("appSettings").doc("googleSetup").set({
    ...config,
    updatedBy: actor.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { success: true };
});

export const getGoogleSetupConfig = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Please login first.");
  const actor = await requireProvisioningRole(request.auth.uid, ["master_owner", "client_admin"]);
  const [configSnapshot, tenantSettingsSnapshot] = await Promise.all([
    db.collection("appSettings").doc("googleSetup").get(),
    actor.tenantId
      ? db.collection("tenantSettings").doc(actor.tenantId).get()
      : Promise.resolve(null),
  ]);
  const config = configSnapshot.data() || {};
  const savedFormats = tenantSettingsSnapshot?.data()?.bankFormats || {};
  const bankFormats = Object.fromEntries(Object.entries(savedFormats).map(([format, value]) => {
    const item = value as { fileId?: unknown; fileName?: unknown; mimeType?: unknown; updatedAt?: { toDate?: () => Date } };
    return [format, {
      fileId: String(item.fileId || ""),
      fileName: String(item.fileName || ""),
      mimeType: String(item.mimeType || ""),
      updatedAt: item.updatedAt?.toDate?.().toISOString() || "",
    }];
  }));
  return {
    oauthClientId: String(config.oauthClientId || ""),
    apiUrl: String(config.apiUrl || ""),
    executorEmail: String(config.executorEmail || ""),
    tenantId: actor.tenantId || "",
    bankName: String(tenantSettingsSnapshot?.data()?.bankName || ""),
    spreadsheetId: String(tenantSettingsSnapshot?.data()?.spreadsheetId || ""),
    photoFolderId: String(tenantSettingsSnapshot?.data()?.photoFolderId || ""),
    googleEmail: String(tenantSettingsSnapshot?.data()?.googleEmail || ""),
    bankFormats,
  };
});

interface SaveBankFormatData {
  formatType: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  accessToken: string;
}

export const saveBankFormatTemplate = onCall<SaveBankFormatData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["client_admin"]);
  const formatType = String(request.data?.formatType || "").trim();
  const fileId = String(request.data?.fileId || "").trim();
  const fileName = String(request.data?.fileName || "").trim();
  const mimeType = String(request.data?.mimeType || "").trim().toLowerCase();
  const accessToken = String(request.data?.accessToken || "").trim();
  if (!actor.tenantId) throw new HttpsError("failed-precondition", "Client account has no workspace assignment.");
  if (!["passbook", "quickPassbook", "accountOpening"].includes(formatType)) {
    throw new HttpsError("invalid-argument", "Choose a supported bank format type.");
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId) || !fileName || fileName.length > 200) {
    throw new HttpsError("invalid-argument", "Uploaded template file is invalid.");
  }
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new HttpsError("invalid-argument", "Upload a PDF, JPG, PNG, or WebP sample.");
  }
  const settingsRef = db.collection("tenantSettings").doc(actor.tenantId);
  const [settingsSnapshot, setupSnapshot] = await Promise.all([
    settingsRef.get(),
    db.collection("appSettings").doc("googleSetup").get(),
  ]);
  const settings = settingsSnapshot.data() || {};
  const setup = setupSnapshot.data() || {};
  const connectedEmail = String(settings.googleEmail || "").toLowerCase();
  const executorEmail = String(setup.executorEmail || "").toLowerCase();
  if (!settings.spreadsheetId || !settings.photoFolderId || !connectedEmail || !executorEmail) {
    throw new HttpsError("failed-precondition", "Connect this workspace's Google Drive first.");
  }
  const verification = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,owners(emailAddress),parents,size,trashed`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const googleFile = await verification.json().catch(() => ({})) as {
    id?: string; name?: string; mimeType?: string; owners?: Array<{ emailAddress?: string }>;
    parents?: string[]; size?: string; trashed?: boolean; error?: { message?: string };
  };
  if (!verification.ok) {
    console.warn("Bank format Drive verification failed with status:", verification.status);
    throw new HttpsError("failed-precondition", "Google could not verify this format file. Reconnect and upload again.");
  }
  const uploadedSize = Number(googleFile.size);
  if (
    googleFile.id !== fileId ||
    googleFile.trashed ||
    String(googleFile.owners?.[0]?.emailAddress || "").toLowerCase() !== connectedEmail ||
    !googleFile.parents?.includes(String(settings.photoFolderId)) ||
    String(googleFile.mimeType || "").toLowerCase() !== mimeType ||
    !Number.isFinite(uploadedSize) || uploadedSize < 1 || uploadedSize > 5 * 1024 * 1024
  ) {
    throw new HttpsError("permission-denied", "The template must be a PDF or image owned by your connected Google account inside this workspace folder, up to 5 MB.");
  }
  const folderPermissionsResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(settings.photoFolderId))}/permissions?fields=permissions(emailAddress,role)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!folderPermissionsResponse.ok) {
    throw new HttpsError("failed-precondition", "Google could not verify the workspace sharing. Reconnect and retry.");
  }
  const folderPermissions = await folderPermissionsResponse.json() as { permissions?: Array<{ emailAddress?: string; role?: string }> };
  const executorAccess = folderPermissions.permissions?.find((permission) =>
    String(permission.emailAddress || "").toLowerCase() === executorEmail
  );
  if (!executorAccess || !["writer", "owner"].includes(String(executorAccess.role))) {
    throw new HttpsError("failed-precondition", "Restore the Bank Setu Apps Script account's access to this workspace folder, then retry.");
  }
  await settingsRef.update({
    [`bankFormats.${formatType}`]: {
      fileId,
      fileName: String(googleFile.name || fileName).slice(0, 200),
      mimeType,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    },
  });
  return { success: true, formatType, fileId };
});
