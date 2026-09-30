import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./AdminUsers.css";

type UserStatus =
  | "pending"
  | "approved"
  | "denied"
  | "blocked"
  | string;

type ManagedUser = {
  uid: string;
  email: string;
  name?: string;
  role?: string;
  status?: UserStatus;
  subscriptionStatus?: string;
  disabled?: boolean;
  createdAt?: string | null;
};

type ManageAction =
  | "approve"
  | "deny"
  | "block"
  | "unblock"
  | "delete";

type Props = {
  embedded?: boolean;
};

const DELETE_API =
  "https://banksetu-admin-api.banksetu2026.workers.dev/delete-user";

function AdminUsers({ embedded = false }: Props) {
  const [open, setOpen] = useState(embedded);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const snapshot = await getDocs(collection(db, "users"));

      setUsers(
        snapshot.docs.map(
          (item) =>
            ({
              uid: item.id,
              ...item.data(),
            } as ManagedUser)
        )
      );
    } catch (err: any) {
      console.error("Admin user list failed:", err);

      setError(
        err?.message || "Unable to load Bank Setu users."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open || embedded) {
      void loadUsers();
    }
  }, [open, embedded, loadUsers]);

  const counts = useMemo(() => {
    const normalUsers = users.filter(
      (u) =>
        String(u.role || "user").toLowerCase() !== "admin"
    );

    const countStatus = (status: string) =>
      normalUsers.filter(
        (u) =>
          String(u.status || "pending").toLowerCase() ===
          status
      ).length;

    return {
      total: normalUsers.length,
      pending: countStatus("pending"),
      approved: countStatus("approved"),
      denied: countStatus("denied"),
    };
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return users;

    return users.filter((user) =>
      [
        user.email,
        user.name,
        user.uid,
        user.status,
        user.role,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(q)
        )
    );
  }, [search, users]);

  const permanentlyDeleteUser = async (
    user: ManagedUser
  ) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error(
        "Administrator session not found. Please log in again."
      );
    }

    /*
     * Force-refresh the Firebase ID token.
     * This token proves to the Worker who is requesting
     * the deletion.
     */
    const idToken = await currentUser.getIdToken(true);

    const response = await fetch(DELETE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: user.uid,
      }),
    });

    let data: any = {};

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Delete API returned an invalid response (${response.status}).`
      );
    }

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.message ||
          `Unable to permanently delete user (${response.status}).`
      );
    }

    return data;
  };

  const runAction = async (
    user: ManagedUser,
    action: ManageAction
  ) => {
    const currentUid = auth.currentUser?.uid;

    if (user.uid === currentUid) {
      setError(
        "You cannot change your own administrator account."
      );
      return;
    }

    const isAdmin =
      String(user.role || "").toLowerCase() === "admin";

    if (isAdmin) {
      setError(
        "Administrator accounts cannot be changed from User Management."
      );
      return;
    }

    const confirmText =
      action === "delete"
        ? `Permanently delete ${user.email || "this user"}?\n\nThis will remove the Firebase Authentication account and Bank Setu user profile.`
        : `Do you want to ${action} ${
            user.email || "this user"
          }?`;

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      setBusyUid(user.uid);
      setError("");
      setMessage("");

      /*
       * DELETE:
       * Cloudflare Worker securely deletes Firebase Auth
       * account + Firestore profile.
       */
      if (action === "delete") {
        const result = await permanentlyDeleteUser(user);

        setMessage(
          result?.message ||
            `${user.email || "User"} permanently deleted successfully.`
        );

        await loadUsers();
        return;
      }

      /*
       * All other actions stay on Firestore.
       */
      const userRef = doc(db, "users", user.uid);

      if (action === "approve") {
        await updateDoc(userRef, {
          status: "approved",
          subscriptionStatus: "active",
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || "",
        });

        setMessage(
          `${user.email || "User"} approved successfully.`
        );
      }

      if (action === "deny") {
        await updateDoc(userRef, {
          status: "denied",
          subscriptionStatus: "inactive",
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || "",
        });

        setMessage(
          `${user.email || "User"} denied successfully.`
        );
      }

      if (action === "block") {
        await updateDoc(userRef, {
          status: "blocked",
          subscriptionStatus: "inactive",
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || "",
        });

        setMessage(
          `${user.email || "User"} blocked successfully.`
        );
      }

      if (action === "unblock") {
        await updateDoc(userRef, {
          status: "approved",
          subscriptionStatus: "active",
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || "",
        });

        setMessage(
          `${user.email || "User"} unblocked successfully.`
        );
      }

      await loadUsers();
    } catch (err: any) {
      console.error(
        `Admin ${action} user failed:`,
        err
      );

      if (err?.code === "permission-denied") {
        setError(
          "Permission denied by Firestore Rules. Admin permission needs to be updated."
        );
      } else {
        setError(
          err?.message ||
            `Unable to ${action} this user.`
        );
      }
    } finally {
      setBusyUid("");
    }
  };

  const panel = (
    <section
      className={
        embedded
          ? "admin-users-panel admin-users-embedded"
          : "admin-users-panel"
      }
    >
      <header className="admin-users-header">
        <div>
          <span className="admin-users-kicker">
            APPLICATION PERMISSION
          </span>

          <h2>User Management</h2>

          <p>
            Approve, deny, block, unblock or permanently
            delete Bank Setu users.
          </p>
        </div>

        {!embedded && (
          <button
            type="button"
            className="admin-users-close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        )}
      </header>

      <div className="admin-user-stats">
        <div>
          <strong>{counts.total}</strong>
          <span>Total Users</span>
        </div>

        <div>
          <strong>{counts.pending}</strong>
          <span>Pending</span>
        </div>

        <div>
          <strong>{counts.approved}</strong>
          <span>Approved</span>
        </div>

        <div>
          <strong>{counts.denied}</strong>
          <span>Denied</span>
        </div>
      </div>

      <div className="admin-users-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, name, UID or status..."
        />

        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div className="admin-users-message success">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="admin-users-message error">
          ! {error}
        </div>
      )}

      <div className="admin-users-list">
        {loading && users.length === 0 ? (
          <div className="admin-users-empty">
            Loading users...
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="admin-users-empty">
            No users found.
          </div>
        ) : (
          visibleUsers.map((user) => {
            const status = String(
              user.status || "pending"
            ).toLowerCase();

            const isBusy = busyUid === user.uid;

            const isAdmin =
              String(user.role || "").toLowerCase() ===
              "admin";

            return (
              <article
                className="admin-user-card"
                key={user.uid}
              >
                <div className="admin-user-main">
                  <div className="admin-user-avatar">
                    {(user.email || "U")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

                  <div className="admin-user-info">
                    <strong>
                      {user.name ||
                        user.email ||
                        "Bank Setu User"}
                    </strong>

                    {user.name && (
                      <span>{user.email}</span>
                    )}

                    <small>{user.uid}</small>
                  </div>
                </div>

                <div className="admin-user-meta">
                  <span
                    className={`admin-user-status status-${status}`}
                  >
                    {status}
                  </span>

                  <span>
                    {isAdmin ? "Admin" : "User"}
                  </span>

                  <span>
                    {user.subscriptionStatus ||
                      "inactive"}
                  </span>
                </div>

                <div className="admin-user-actions">
                  {(status === "pending" ||
                    status === "denied" ||
                    (status === "approved" &&
                      String(user.subscriptionStatus || "inactive").toLowerCase() !== "active")) &&
                    !isAdmin && (
                      <button
                        className="approve"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(
                            user,
                            "approve"
                          )
                        }
                      >
                        Approve
                      </button>
                    )}

                  {status === "pending" &&
                    !isAdmin && (
                      <button
                        className="delete"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(
                            user,
                            "deny"
                          )
                        }
                      >
                        Deny
                      </button>
                    )}

                  {status !== "blocked" &&
                    status !== "pending" &&
                    !isAdmin && (
                      <button
                        className="block"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(
                            user,
                            "block"
                          )
                        }
                      >
                        Block
                      </button>
                    )}

                  {status === "blocked" &&
                    !isAdmin && (
                      <button
                        className="unblock"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(
                            user,
                            "unblock"
                          )
                        }
                      >
                        Unblock
                      </button>
                    )}

                  {!isAdmin && (
                    <button
                      className="delete"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          user,
                          "delete"
                        )
                      }
                    >
                      {isBusy
                        ? "Working..."
                        : "Delete"}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  if (embedded) {
    return panel;
  }

  return (
    <>
      <button
        type="button"
        className="admin-users-fab"
        onClick={() => setOpen(true)}
      >
        👥 Users
      </button>

      {open && (
        <div
          className="admin-users-overlay"
          role="dialog"
          aria-modal="true"
        >
          {panel}
        </div>
      )}
    </>
  );
}

export default AdminUsers;