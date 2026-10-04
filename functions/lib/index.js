"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = exports.denyUser = exports.deleteUser = exports.unblockUser = exports.blockUser = exports.approveUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)();
async function requireAdmin(uid) {
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "Please login first.");
    }
    const adminDoc = await db.collection("users").doc(uid).get();
    if (!adminDoc.exists) {
        throw new https_1.HttpsError("permission-denied", "Administrator record not found.");
    }
    const adminData = adminDoc.data();
    const role = String(adminData?.role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "master_owner") {
        throw new https_1.HttpsError("permission-denied", "Only Master Owner or administrator can perform this action.");
    }
}
function getTargetUid(request) {
    const uid = String(request.data?.uid || "").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "User UID is required.");
    }
    if (uid === request.auth?.uid) {
        throw new https_1.HttpsError("failed-precondition", "Administrator cannot perform this action on own account.");
    }
    return uid;
}
/* =========================================
   APPROVE USER
========================================= */
exports.approveUser = (0, https_1.onCall)(async (request) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError("not-found", "User record not found.");
    }
    await auth.updateUser(uid, { disabled: false });
    await userRef.update({
        status: "approved",
        subscriptionStatus: "active",
        approvedAt: firestore_1.FieldValue.serverTimestamp(),
        approvedBy: request.auth?.uid,
    });
    return {
        success: true,
        message: "User approved successfully.",
    };
});
/* =========================================
   BLOCK USER
========================================= */
exports.blockUser = (0, https_1.onCall)(async (request) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError("not-found", "User record not found.");
    }
    await auth.updateUser(uid, { disabled: true });
    await userRef.update({
        status: "blocked",
        subscriptionStatus: "inactive",
        blockedAt: firestore_1.FieldValue.serverTimestamp(),
        blockedBy: request.auth?.uid,
    });
    return {
        success: true,
        message: "User blocked successfully.",
    };
});
/* =========================================
   UNBLOCK USER
========================================= */
exports.unblockUser = (0, https_1.onCall)(async (request) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError("not-found", "User record not found.");
    }
    await auth.updateUser(uid, { disabled: false });
    await userRef.update({
        status: "approved",
        subscriptionStatus: "active",
        unblockedAt: firestore_1.FieldValue.serverTimestamp(),
        unblockedBy: request.auth?.uid,
    });
    return {
        success: true,
        message: "User unblocked successfully.",
    };
});
/* =========================================
   DELETE USER
========================================= */
exports.deleteUser = (0, https_1.onCall)(async (request) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    try {
        await auth.deleteUser(uid);
    }
    catch (error) {
        const firebaseError = error;
        if (firebaseError.code !== "auth/user-not-found") {
            console.error("Authentication delete error:", error);
            throw new https_1.HttpsError("internal", "Unable to delete Authentication account.");
        }
    }
    await userRef.delete();
    return {
        success: true,
        message: "User deleted successfully.",
    };
});
/* =========================================
   DENY USER
========================================= */
exports.denyUser = (0, https_1.onCall)(async (request) => {
    await requireAdmin(request.auth?.uid);
    const uid = getTargetUid(request);
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists)
        throw new https_1.HttpsError("not-found", "User record not found.");
    await auth.updateUser(uid, { disabled: true });
    await userRef.update({
        status: "denied",
        subscriptionStatus: "inactive",
        deniedAt: firestore_1.FieldValue.serverTimestamp(),
        deniedBy: request.auth?.uid,
    });
    return { success: true, message: "User denied successfully." };
});
async function requireMasterOwner(uid) {
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "Please login first.");
    }
    const ownerDoc = await db
        .collection("users")
        .doc(uid)
        .get();
    if (!ownerDoc.exists) {
        throw new https_1.HttpsError("permission-denied", "Master Owner record not found.");
    }
    const role = String(ownerDoc.data()?.role || "")
        .trim()
        .toLowerCase();
    if (role !== "master_owner") {
        throw new https_1.HttpsError("permission-denied", "Only Master Owner can create a client.");
    }
}
function createTenantId() {
    const timePart = Date.now()
        .toString(36)
        .toUpperCase();
    const randomPart = Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase();
    return `BS-${timePart}-${randomPart}`;
}
exports.createClient = (0, https_1.onCall)(async (request) => {
    await requireMasterOwner(request.auth?.uid);
    const name = String(request.data?.name || "").trim();
    const mobile = String(request.data?.mobile || "").trim();
    const email = String(request.data?.email || "")
        .trim()
        .toLowerCase();
    const password = String(request.data?.password || "");
    const bankName = String(request.data?.bankName || "").trim();
    if (!name) {
        throw new https_1.HttpsError("invalid-argument", "Client name is required.");
    }
    if (!mobile) {
        throw new https_1.HttpsError("invalid-argument", "Client mobile number is required.");
    }
    if (!email || !email.includes("@")) {
        throw new https_1.HttpsError("invalid-argument", "A valid client email is required.");
    }
    if (password.length < 6) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 6 characters.");
    }
    const tenantId = createTenantId();
    let createdUid = "";
    try {
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: name,
            disabled: false,
        });
        createdUid = userRecord.uid;
        await db
            .collection("users")
            .doc(createdUid)
            .set({
            name,
            mobile,
            email,
            role: "client_admin",
            tenantId,
            clientId: tenantId,
            bankName,
            status: "approved",
            subscriptionStatus: "active",
            maxUsers: 2,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdBy: request.auth?.uid,
        });
        return {
            success: true,
            uid: createdUid,
            tenantId,
            clientId: tenantId,
            email,
            message: "Client created successfully.",
        };
    }
    catch (error) {
        if (createdUid) {
            try {
                await auth.deleteUser(createdUid);
            }
            catch (rollbackError) {
                console.error("Create client rollback failed:", rollbackError);
            }
        }
        const firebaseError = error;
        if (firebaseError.code ===
            "auth/email-already-exists") {
            throw new https_1.HttpsError("already-exists", "This email is already registered.");
        }
        console.error("Create client failed:", error);
        throw new https_1.HttpsError("internal", firebaseError.message ||
            "Unable to create client.");
    }
});
//# sourceMappingURL=index.js.map