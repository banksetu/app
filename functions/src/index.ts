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

  if (adminData?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only administrator can perform this action."
    );
  }
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
