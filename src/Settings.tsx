import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

import { db } from "./firebase";

type AppUser = {
  id: string;
  name?: string;
  email?: string;
  mobile?: string;
  role?: string;
  status?: string;
  subscriptionStatus?: string;
  createdAt?: string;
};

function Settings() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),

      (snapshot) => {
        const list: AppUser[] = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<AppUser, "id">),
          }))
          .filter((user) => user.role !== "admin");

        setUsers(list);
        setLoading(false);
      },

      (error) => {
        console.error(error);

        setMessage(
          "Users could not be loaded. Please check administrator permission."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const pendingUsers = useMemo(
    () =>
      users.filter(
        (user) => user.status === "pending"
      ),
    [users]
  );

  const approvedUsers = useMemo(
    () =>
      users.filter(
        (user) => user.status === "approved"
      ),
    [users]
  );

  const deniedUsers = useMemo(
    () =>
      users.filter(
        (user) => user.status === "denied"
      ),
    [users]
  );

  const approveUser = async (user: AppUser) => {
    const confirmed = window.confirm(
      `Approve ${user.name || user.email || "this user"}?`
    );

    if (!confirmed) return;

    try {
      await updateDoc(
        doc(db, "users", user.id),
        {
          status: "approved",
          subscriptionStatus: "active",
        }
      );

      setMessage(
        `${user.name || user.email || "User"} approved successfully.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "User approval failed. Please try again."
      );
    }
  };

  const denyUser = async (user: AppUser) => {
    const confirmed = window.confirm(
      `Deny access for ${user.name || user.email || "this user"}?`
    );

    if (!confirmed) return;

    try {
      await updateDoc(
        doc(db, "users", user.id),
        {
          status: "denied",
          subscriptionStatus: "inactive",
        }
      );

      setMessage(
        `${user.name || user.email || "User"} access denied.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "User access could not be denied."
      );
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.headingArea}>
        <p style={styles.eyebrow}>
          BANK SETU ADMINISTRATION
        </p>

        <h1 style={styles.heading}>
          Settings
        </h1>

        <p style={styles.subtitle}>
          Manage users and application permissions
        </p>
      </div>

      <section style={styles.statsGrid}>
        <StatCard
          title="Pending Users"
          value={pendingUsers.length}
          icon="⏳"
        />

        <StatCard
          title="Approved Users"
          value={approvedUsers.length}
          icon="✓"
        />

        <StatCard
          title="Denied Users"
          value={deniedUsers.length}
          icon="⛔"
        />

        <StatCard
          title="Total Users"
          value={users.length}
          icon="👥"
        />
      </section>

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      <section style={styles.card}>
        <div style={styles.cardHeading}>
          <p style={styles.sectionLabel}>
            USER APPROVAL
          </p>

          <h2 style={styles.cardTitle}>
            New User Requests
          </h2>

          <p style={styles.cardDescription}>
            New Bank Setu accounts will remain blocked until
            an administrator approves them.
          </p>
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            Loading users...
          </div>
        ) : pendingUsers.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              ✓
            </div>

            <strong>
              No pending user requests
            </strong>

            <span>
              New signup requests will automatically appear here.
            </span>
          </div>
        ) : (
          <div style={styles.userList}>
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="user-approval-row"
                style={styles.userRow}
              >
                <div style={styles.avatar}>
                  {(user.name ||
                    user.email ||
                    "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div style={styles.userInformation}>
                  <strong style={styles.userName}>
                    {user.name || "New User"}
                  </strong>

                  <span style={styles.userEmail}>
                    {user.email || "No email"}
                  </span>

                  {user.mobile && (
                    <span style={styles.userMeta}>
                      Mobile: {user.mobile}
                    </span>
                  )}

                  {user.createdAt && (
                    <span style={styles.userMeta}>
                      Registered:{" "}
                      {formatDate(user.createdAt)}
                    </span>
                  )}
                </div>

                <span style={styles.pendingBadge}>
                  Pending
                </span>

                <div
                  className="user-action-buttons"
                  style={styles.actions}
                >
                  <button
                    type="button"
                    style={styles.approveButton}
                    onClick={() =>
                      approveUser(user)
                    }
                  >
                    ✓ Approve
                  </button>

                  <button
                    type="button"
                    style={styles.denyButton}
                    onClick={() =>
                      denyUser(user)
                    }
                  >
                    × Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeading}>
          <p style={styles.sectionLabel}>
            USER MANAGEMENT
          </p>

          <h2 style={styles.cardTitle}>
            Existing Users
          </h2>

          <p style={styles.cardDescription}>
            More controls such as subscription duration,
            blocking, re-activation and user permissions
            will be added here later.
          </p>
        </div>

        {users.filter(
          (user) => user.status !== "pending"
        ).length === 0 ? (
          <div style={styles.emptyState}>
            No existing users yet.
          </div>
        ) : (
          <div style={styles.userList}>
            {users
              .filter(
                (user) =>
                  user.status !== "pending"
              )
              .map((user) => (
                <div
                  key={user.id}
                  style={styles.existingUserRow}
                >
                  <div style={styles.avatar}>
                    {(user.name ||
                      user.email ||
                      "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div style={styles.userInformation}>
                    <strong style={styles.userName}>
                      {user.name || "User"}
                    </strong>

                    <span style={styles.userEmail}>
                      {user.email}
                    </span>
                  </div>

                  <span
                    style={
                      user.status === "approved"
                        ? styles.approvedBadge
                        : styles.deniedBadge
                    }
                  >
                    {user.status || "Unknown"}
                  </span>
                </div>
              ))}
          </div>
        )}
      </section>

      <style>
        {`
          @media (max-width: 760px) {
            .user-approval-row {
              align-items: flex-start !important;
              flex-wrap: wrap !important;
            }

            .user-action-buttons {
              width: 100% !important;
            }

            .user-action-buttons button {
              flex: 1 !important;
            }
          }
        `}
      </style>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>
        {icon}
      </div>

      <div>
        <div style={styles.statValue}>
          {value}
        </div>

        <div style={styles.statTitle}>
          {title}
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    width: "100%",
    maxWidth: "1150px",
    margin: "0 auto",
  },

  headingArea: {
    textAlign: "center",
    marginBottom: "24px",
  },

  eyebrow: {
    margin: 0,
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.8px",
  },

  heading: {
    margin: "6px 0",
    color: "#fff",
    fontSize: "27px",
  },

  subtitle: {
    margin: 0,
    color: "#91a7b3",
    fontSize: "10px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(180px,1fr))",
    gap: "14px",
    marginBottom: "18px",
  },

  statCard: {
    display: "flex",
    alignItems: "center",
    gap: "13px",
    padding: "17px",
    borderRadius: "16px",
    background:
      "linear-gradient(145deg,#092631,#0b303d)",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  statIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "rgba(55,220,195,0.08)",
  },

  statValue: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: 800,
  },

  statTitle: {
    marginTop: "2px",
    color: "#91a6b2",
    fontSize: "9px",
  },

  message: {
    marginBottom: "16px",
    padding: "12px",
    borderRadius: "11px",
    background:
      "rgba(55,220,195,0.07)",
    color: "#49e1c7",
    fontSize: "9px",
  },

  card: {
    padding: "22px",
    marginBottom: "18px",
    borderRadius: "18px",
    background:
      "linear-gradient(145deg,#09232e,#0b2a36)",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  cardHeading: {
    marginBottom: "18px",
  },

  sectionLabel: {
    margin: 0,
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.4px",
  },

  cardTitle: {
    margin: "6px 0",
    color: "#fff",
    fontSize: "18px",
  },

  cardDescription: {
    margin: 0,
    color: "#8fa5b2",
    fontSize: "9px",
    lineHeight: 1.5,
  },

  userList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "13px",
    borderRadius: "13px",
    background: "#0a2d39",
    border:
      "1px solid rgba(255,255,255,0.05)",
  },

  existingUserRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "13px",
    borderRadius: "13px",
    background: "#0a2d39",
  },

  avatar: {
    width: "40px",
    height: "40px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    background:
      "linear-gradient(135deg,#39e0c5,#28a9e8)",
    color: "#032127",
    fontWeight: 800,
  },

  userInformation: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },

  userName: {
    color: "#fff",
    fontSize: "11px",
  },

  userEmail: {
    color: "#93a8b3",
    fontSize: "9px",
    wordBreak: "break-all",
  },

  userMeta: {
    color: "#718a98",
    fontSize: "8px",
  },

  pendingBadge: {
    padding: "6px 9px",
    borderRadius: "999px",
    background:
      "rgba(240,185,93,0.08)",
    color: "#efba56",
    fontSize: "8px",
    fontWeight: 700,
  },

  approvedBadge: {
    padding: "6px 9px",
    borderRadius: "999px",
    background:
      "rgba(55,220,195,0.08)",
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 700,
    textTransform: "capitalize",
  },

  deniedBadge: {
    padding: "6px 9px",
    borderRadius: "999px",
    background:
      "rgba(255,90,90,0.07)",
    color: "#ff9090",
    fontSize: "8px",
    fontWeight: 700,
    textTransform: "capitalize",
  },

  actions: {
    display: "flex",
    gap: "7px",
  },

  approveButton: {
    height: "36px",
    padding: "0 12px",
    border: "none",
    borderRadius: "9px",
    background:
      "rgba(55,220,195,0.13)",
    color: "#4ae2c8",
    fontWeight: 700,
    cursor: "pointer",
  },

  denyButton: {
    height: "36px",
    padding: "0 12px",
    border:
      "1px solid rgba(255,90,90,0.15)",
    borderRadius: "9px",
    background:
      "rgba(255,90,90,0.05)",
    color: "#ff9292",
    fontWeight: 700,
    cursor: "pointer",
  },

  emptyState: {
    minHeight: "115px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    textAlign: "center",
    color: "#8da2ae",
    fontSize: "9px",
    borderRadius: "13px",
    background:
      "rgba(255,255,255,0.025)",
  },

  emptyIcon: {
    color: "#45dfc5",
    fontSize: "23px",
  },
};

export default Settings;