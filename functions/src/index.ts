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
      apiUrl: "",
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
}

export const configureTenantData = onCall<ConfigureTenantData>(async (request) => {
  const actor = await requireProvisioningRole(request.auth?.uid, ["master_owner"]);
  const tenantId = String(request.data?.tenantId || "").trim();
  const spreadsheetId = String(request.data?.spreadsheetId || "").trim();
  const photoFolderId = String(request.data?.photoFolderId || "").trim();
  const apiUrl = String(request.data?.apiUrl || "").trim();
  if (!tenantId || tenantId.length > 128) {
    throw new HttpsError("invalid-argument", "Choose a valid client workspace.");
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new HttpsError("invalid-argument", "Enter the Google Sheet ID, not its full URL.");
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(photoFolderId)) {
    throw new HttpsError("invalid-argument", "Enter the Google Drive folder ID.");
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl)) {
    throw new HttpsError("invalid-argument", "Enter a valid Apps Script Web App URL ending in /exec.");
  }
  const tenantRef = db.collection("tenants").doc(tenantId);
  const tenant = await tenantRef.get();
  if (!tenant.exists || tenant.data()?.status !== "active") {
    throw new HttpsError("not-found", "Active client workspace not found.");
  }
  await db.collection("tenantSettings").doc(tenantId).set({
    tenantId,
    bankName: tenant.data()?.bankName || "",
    apiUrl,
    spreadsheetId,
    photoFolderId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  }, { merge: true });
  return { success: true, tenantId };
});
