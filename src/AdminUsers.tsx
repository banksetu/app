import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
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
  tenantId?: string;
  clientId?: string;
  bankName?: string;
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

function AdminUsers({ embedded = false }: Props) {
  const [open, setOpen] = useState(embedded);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const currentAuthUser = auth.currentUser;
  const isMasterAdmin = currentRole === "master_owner" || (
    currentRole === "admin" &&
    currentAuthUser?.email?.trim().toLowerCase() === "banksetu2026@gmail.com" &&
    currentAuthUser.emailVerified
  );

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in again.");
      const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));
      const currentProfile = profileSnapshot.data();
      setCurrentRole(String(currentProfile?.role || ""));
      const usersRef = collection(db, "users");
      const usersQuery = currentProfile?.role === "client_admin"
        ? currentProfile.tenantId
          ? query(usersRef, where("tenantId", "==", currentProfile.tenantId))
          : null
        : usersRef;
      if (!usersQuery) throw new Error("This client account has no workspace assignment.");
      const snapshot = await getDocs(usersQuery);

      setUsers(
        snapshot.docs.map(
          (item) =>
            ({
              uid: item.id,
              ...item.data(),
            } as ManagedUser)
        )
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error("Admin user list failed:", err);

      setError(
        err?.message || "Unable to load Bank Setu users."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const createClientUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusyUid("create-client-user");
    try {
      await callBankSetuWorker<{ success: boolean }>("/create-client-user", {
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
      });
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setMessage("Client user account created for this workspace.");
      await loadUsers();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to create the client user.");
    } finally {
      setBusyUid("");
    }
  };

  useEffect(() => {
    if (open || embedded) {
      const timer = window.setTimeout(() => void loadUsers(), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, embedded, loadUsers]);

  const counts = useMemo(() => {
    const isMaster = isMasterAdmin;
    // The Master Admin needs totals for the complete client tree. A Client
    // Admin sees only the two operational users in their own tenant, not their
    // own administrator account.
    const countedUsers = users.filter((u) => {
      const role = String(u.role || "user").toLowerCase();
      if (["admin", "master_owner"].includes(role)) return false;
      return isMaster || role !== "client_admin";
    });

    const countStatus = (status: string) =>
      countedUsers.filter(
        (u) =>
          String(u.status || "pending").toLowerCase() ===
          status
      ).length;

    return {
      total: countedUsers.length,
      pending: countStatus("pending"),
      approved: countStatus("approved"),
      denied: countStatus("denied"),
      clientAdmins: isMaster
        ? users.filter((u) => String(u.role || "").toLowerCase() === "client_admin").length
        : 0,
    };
  }, [currentRole, isMasterAdmin, users]);

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
        user.tenantId,
        user.bankName,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(q)
        )
    );
  }, [search, users]);

  const orderedVisibleUsers = useMemo(() => [...visibleUsers].sort((left, right) => {
    const leftGroup = String(left.tenantId || "~legacy");
    const rightGroup = String(right.tenantId || "~legacy");
    if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
    const roleOrder: Record<string, number> = { client_admin: 0, client_user: 1 };
    const leftRole = String(left.role || "user").toLowerCase();
    const rightRole = String(right.role || "user").toLowerCase();
    return (roleOrder[leftRole] ?? 2) - (roleOrder[rightRole] ?? 2) ||
      String(left.email || "").localeCompare(String(right.email || ""));
  }), [visibleUsers]);

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

    const targetRole = String(user.role || "user").toLowerCase();
    const canManageClientAdmin = targetRole === "client_admin" && isMasterAdmin;
    const canManageRegularUser = !["admin", "master_owner"].includes(targetRole) &&
      (targetRole !== "client_admin" || isMasterAdmin);
    if (!canManageClientAdmin && !canManageRegularUser) {
      setError(
        "Administrator accounts cannot be changed from User Management."
      );
      return;
    }

    const confirmText = `Do you want to ${action} ${
            user.email || "this user"
          }?`;

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      setBusyUid(user.uid);
      setError("");
      setMessage("");
      if (action === "delete") {
        if (currentRole !== "master_owner" && currentRole !== "admin") {
          throw new Error("Only the Master Admin can delete accounts.");
        }
        await callBankSetuWorker<{ success: boolean }>("/delete-user", { uid: user.uid });
      } else {
        await callBankSetuWorker<{ success: boolean }>("/account-action", {
          uid: user.uid,
          action,
        });
      }
      setMessage(`${user.email || "User"} ${action} successful.`);
      await loadUsers();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
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
            {currentRole === "client_admin"
              ? "Manage the two users in your workspace. You can approve, deny, block or unblock their access."
              : "Search and manage client workspaces, Client Admins, and their users."}
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

      {currentRole === "client_admin" && (
        <form onSubmit={(event) => void createClientUser(event)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, padding: "14px 0" }}>
          <input required aria-label="Client user name" placeholder="User name" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
          <input required type="email" aria-label="Client user email" placeholder="User email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} />
          <input required type="password" minLength={8} aria-label="Client user password" placeholder="Temporary password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} />
          <button type="submit" disabled={busyUid === "create-client-user"}>
            {busyUid === "create-client-user" ? "Creating…" : "Add Client User"}
          </button>
        </form>
      )}

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

        {isMasterAdmin && (
          <div>
            <strong>{counts.clientAdmins}</strong>
            <span>Client Admins</span>
          </div>
        )}
      </div>

      <div className="admin-users-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isMasterAdmin ? "Search client, admin, user, email or workspace..." : "Search email, name, UID or status..."}
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
          orderedVisibleUsers.map((user, index) => {
            const groupId = String(user.tenantId || "unassigned");
            const previousGroupId = index > 0
              ? String(orderedVisibleUsers[index - 1].tenantId || "unassigned")
              : "";
            const isNewClientGroup = isMasterAdmin && groupId !== previousGroupId;
            const clientAdmin = groupId === "unassigned" ? undefined : users.find((candidate) =>
              candidate.tenantId === groupId && String(candidate.role || "").toLowerCase() === "client_admin"
            );
            const groupUsers = users.filter((candidate) =>
              candidate.tenantId === user.tenantId && String(candidate.role || "").toLowerCase() === "client_user"
            );
            const status = String(
              user.status || "pending"
            ).toLowerCase();

            const isBusy = busyUid === user.uid;

            const role = String(user.role || "user").toLowerCase();
            const isAdmin = ["admin", "master_owner", "client_admin"].includes(role);
            const canManage = !["admin", "master_owner"].includes(role) &&
              (role !== "client_admin" || isMasterAdmin) &&
              (currentRole !== "client_admin" || role === "client_user");

            return (
              <div key={user.uid}>
              {isNewClientGroup && (
                <div className="admin-user-group-heading">
                  <div>
                    <strong>{groupId === "unassigned" ? "Legacy / unassigned accounts" : (user.bankName || clientAdmin?.bankName || "Client workspace")}</strong>
                    <small>{groupId === "unassigned" ? "Accounts without a tenant" : `Workspace: ${groupId}`}</small>
                  </div>
                  {clientAdmin && <div className="admin-user-group-owner">
                    <span>Client Admin</span>
                    <strong>{clientAdmin.name || clientAdmin.email}</strong>
                    <small>{clientAdmin.email} · {String(clientAdmin.status || "unknown")}</small>
                    <small>{groupUsers.length}/2 client users</small>
                  </div>}
                </div>
              )}
              <article className="admin-user-card">
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
                    {role === "master_owner" ? "Master Admin" :
                      role === "client_admin" ? "Client Admin" :
                        role === "client_user" ? "Client User" :
                          role === "admin" ? "Admin" : "User"}
                  </span>
                  {user.tenantId && <span>{user.bankName || user.tenantId}</span>}

                  <span>
                    {user.subscriptionStatus ||
                      "inactive"}
                  </span>
                </div>

                <div className="admin-user-actions">
                  {canManage && !isAdmin && (
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

                  {canManage && !isAdmin && status !== "denied" && (
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
                    canManage && (role === "client_admin" || !isAdmin) && (
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
                    canManage && (role === "client_admin" || !isAdmin) && (
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

                  {(currentRole === "master_owner" || currentRole === "admin") &&
                    role !== "master_owner" && role !== "admin" && role !== "client_admin" && (
                      <button
                        className="delete"
                        disabled={isBusy}
                        onClick={() => void runAction(user, "delete")}
                      >
                        Delete
                      </button>
                    )}

                </div>
              </article>
              </div>
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
