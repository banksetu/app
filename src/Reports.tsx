import { localDataFetch, getDataIdToken, getLocalSnapshot, localModeEnabled } from "./core/localData";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import type { CSSProperties } from "react";
import { getTenantApiUrl } from "./tenantApi";

type ActivityItem = {
  id: string;
  dateTime: string;
  activity: string;
  customerName: string;
  accountNo: string;
  customerId?: string;
  details: string;
  user?: string;
  email?: string;
};

export default function Reports() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadActivities = async () => {
    setLoading(true);
    setError("");
    const user = getAuth().currentUser;
    const uid = user?.uid;
    const tenant = sessionStorage.getItem("bankSetuTenantId");
    const connection = sessionStorage.getItem("bankSetuConnectionId");
    const sameWorkspace = () => getAuth().currentUser?.uid === uid &&
      sessionStorage.getItem("bankSetuTenantId") === tenant &&
      sessionStorage.getItem("bankSetuConnectionId") === connection;
    const entry = (customer: Record<string, unknown>, id: string, action: string, date: unknown): ActivityItem => ({
      id, dateTime: String(date || ""), activity: action,
      customerName: String(customer.name || ""), accountNo: String(customer.accountNo || ""),
      customerId: String(customer.enrolId || ""), details: action === "Customer Deleted" ? "Deleted" : "Customer record",
      user: String(customer.updatedBy || ""), email: "",
    });
    const recent = (items: ActivityItem[]) => [...new Map(items.map(item => [item.id,item])).values()]
      .sort((a,b) => (Date.parse(b.dateTime)||0)-(Date.parse(a.dateTime)||0)).slice(0,10);
    let local: ActivityItem[] = [];
    try {
      if (!user) throw new Error("An active customer workspace is required.");
      if (localModeEnabled()) {
        const snapshot = await getLocalSnapshot();
        local = recent([
          ...snapshot.records.filter(record => !record.deleted).map(record =>
            entry(record.customer, `customer:${record.recordId}`, "Customer Saved", record.customer.updatedAt || record.customer.createdAt || record.cachedAt)),
          ...snapshot.operations.map(operation =>
            entry(operation.customer, `operation:${operation.operationId}`, operation.action, operation.createdAt)),
        ]);
        if (sameWorkspace()) setActivities(local);
      }
      if (!navigator.onLine) return;
      const apiUrl = getTenantApiUrl();
      if (!apiUrl) throw new Error("Customer workspace is unavailable.");
      const idToken = await getDataIdToken();
      const request = async (body: Record<string, unknown>) => {
        const response = await localDataFetch(apiUrl, {method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({...body,idToken})});
        if (!response.ok) throw new Error("Customer workspace is unavailable.");
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Recent activity unavailable.");
        return result;
      };
      const [audit, first] = await Promise.allSettled([
        request({action:"getRecentActivities",limit:10}),
        request({action:"getAllCustomers",page:1,pageSize:1}),
      ]);
      const cloud: ActivityItem[] = [];
      if (audit.status === "fulfilled") {
        const rows = audit.value.activities || audit.value.recentActivities || [];
        for (const [index,item] of (Array.isArray(rows)?rows:[]).entries()) {
          const row=item as Record<string, unknown>;
          cloud.push({id:String(row.id || `audit:${index}`),dateTime:String(row.dateTime||""),activity:String(row.activity||row.action||""),
            customerName:String(row.customerName||""),accountNo:String(row.accountNo||""),customerId:String(row.customerId||row.cif||""),
            details:String(row.details||""),user:String(row.user||row.actorName||""),email:String(row.email||"")});
        }
      }
      if (first.status === "fulfilled") {
        const total=Number(first.value.totalRows || first.value.customers?.length || 0);
        const page=Math.max(1,Math.ceil(total/100));
        const customers=total>0 ? (await request({action:"getAllCustomers",page,pageSize:100})).customers || [] : [];
        for (const customer of customers as Record<string, unknown>[])
          cloud.push(entry(customer,`customer:${customer.recordId||customer.rowNumber}`,"Customer Saved",customer.updatedAt || customer.createdAt));
      }
      if (sameWorkspace()) setActivities(recent([...local,...cloud]));
      if (audit.status === "rejected" && first.status === "rejected") throw first.reason;
    } catch (err) {
      if (sameWorkspace()) setError(err instanceof Error ? err.message : "Recent activities could not be loaded.");
    } finally { if (sameWorkspace()) setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivities(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>REPORTS</p>
          <h1 style={styles.title}>Recent Activity</h1>
          <p style={styles.subtitle}>
            Last 10 activities performed in Bank Setu
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.refreshButton}
            onClick={() => void loadActivities()}
            disabled={loading}
          >
            {loading ? "Loading..." : "↻ Refresh"}
          </button>

          <div style={styles.counter}>
            <span style={styles.counterNumber}>{activities.length}</span>
            <span style={styles.counterText}>Recent Activities</span>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Activity History</h2>
            <p style={styles.panelText}>
              Latest customer and passbook activities
            </p>
          </div>

          <span style={styles.liveBadge}>● LIVE</span>
        </div>

        {error && activities.length > 0 && <p role="alert" style={styles.errorText}>{error}</p>}
        {loading && !activities.length ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⏳</div>
            <h3 style={styles.emptyTitle}>Loading Activities...</h3>
            <p style={styles.emptyText}>
              Fetching the latest activity from Bank Setu.
            </p>
          </div>
        ) : error && !activities.length ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⚠️</div>
            <h3 style={styles.emptyTitle}>Activity Could Not Be Loaded</h3>
            <p style={styles.errorText}>{error}</p>
            <button
              type="button"
              style={styles.retryButton}
              onClick={() => void loadActivities()}
            >
              Try Again
            </button>
          </div>
        ) : activities.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📊</div>
            <h3 style={styles.emptyTitle}>No Activity Recorded Yet</h3>
            <p style={styles.emptyText}>
              New customer, update, passbook print, delivery and delete
              activities will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="reports-desktop">
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTIVITY</th>
                      <th style={styles.th}>CUSTOMER</th>
                      <th style={styles.th}>ACCOUNT / CIF</th>
                      <th style={styles.th}>DETAILS</th>
                      <th style={styles.th}>USER</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activities.map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td}>{item.dateTime || "—"}</td>

                        <td style={styles.td}>
                          <span style={styles.activityBadge}>
                            {item.activity || "Activity"}
                          </span>
                        </td>

                        <td style={styles.tdStrong}>
                          {item.customerName || "—"}
                        </td>

                        <td style={styles.td}>
                          <div>{item.accountNo || "—"}</div>
                          {item.customerId ? (
                            <div style={styles.subValue}>
                              CIF: {item.customerId}
                            </div>
                          ) : null}
                        </td>

                        <td style={styles.td}>{item.details || "—"}</td>
                        <td style={styles.td}>
                          <div>{item.user || item.email || "—"}</div>
                          {item.email && item.email !== item.user ? (
                            <div style={styles.subValue}>{item.email}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="reports-mobile">
              {activities.map((item) => (
                <article key={item.id} style={styles.mobileCard}>
                  <div style={styles.mobileTop}>
                    <span style={styles.activityBadge}>
                      {item.activity || "Activity"}
                    </span>
                    <span style={styles.mobileDate}>
                      {item.dateTime || "—"}
                    </span>
                  </div>

                  <MobileRow
                    label="Customer"
                    value={item.customerName || "—"}
                    strong
                  />
                  <MobileRow
                    label="Account"
                    value={item.accountNo || "—"}
                  />
                  <MobileRow
                    label="CIF / ID"
                    value={item.customerId || "—"}
                  />
                  <MobileRow
                    label="Details"
                    value={item.details || "—"}
                  />
                  <MobileRow
                    label="User"
                    value={item.user || "—"}
                    last
                  />
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <style>
        {`
          .reports-mobile {
            display: none;
          }

          .reports-desktop {
            display: block;
          }

          @media (max-width: 760px) {
            .reports-desktop {
              display: none !important;
            }

            .reports-mobile {
              display: block !important;
            }
          }
        `}
      </style>
    </section>
  );
}

function MobileRow({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        ...styles.mobileRow,
        ...(last ? { borderBottom: "none" } : {}),
      }}
    >
      <span style={styles.mobileLabel}>{label}</span>
      <span
        style={{
          ...styles.mobileValue,
          ...(strong ? { fontWeight: 700, color: "#34344c" } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },

  eyebrow: {
    margin: "0 0 5px",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "1.8px",
    color: "#32d9b1",
  },

  title: {
    margin: 0,
    color: "#34344c",
    fontSize: "clamp(24px, 4vw, 34px)",
    fontWeight: 800,
  },

  subtitle: {
    margin: "7px 0 0",
    color: "#85869b",
    fontSize: "13px",
  },

  refreshButton: {
    border: "1px solid rgba(55,221,180,0.24)",
    background: "rgba(55,221,180,0.08)",
    color: "#55e5c1",
    borderRadius: "11px",
    padding: "10px 13px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },

  counter: {
    minWidth: "145px",
    padding: "12px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(117,98,234,.16)",
    background: "linear-gradient(135deg,#8b78f3,#705de4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },

  counterNumber: {
    color: "#ffffff",
    fontSize: "24px",
    fontWeight: 800,
  },

  counterText: {
    color: "rgba(255,255,255,.82)",
    fontSize: "10px",
  },

  panel: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "18px",
    overflow: "hidden",
    border: "1px solid #e7e5f0",
    background:
      "linear-gradient(145deg,#ffffff,#faf9ff)",
    boxShadow: "0 12px 34px rgba(74,65,122,.10)",
  },

  panelHeader: {
    padding: "18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #eceaf3",
  },

  panelTitle: {
    margin: 0,
    color: "#34344c",
    fontSize: "17px",
  },

  panelText: {
    margin: "5px 0 0",
    color: "#85869b",
    fontSize: "11px",
  },

  liveBadge: {
    flexShrink: 0,
    color: "#37ddb4",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "1px",
    padding: "6px 9px",
    borderRadius: "999px",
    background: "rgba(55,221,180,0.08)",
    border: "1px solid rgba(55,221,180,0.18)",
  },

  tableWrapper: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "940px",
  },

  th: {
    padding: "12px 14px",
    textAlign: "left",
    color: "#77758c",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.7px",
    borderBottom: "1px solid #eceaf3",
    background: "#f7f5fc",
  },

  td: {
    padding: "14px",
    textAlign: "left",
    verticalAlign: "middle",
    color: "#5f6074",
    fontSize: "11px",
    borderBottom: "1px solid #efedf5",
  },

  tdStrong: {
    padding: "14px",
    textAlign: "left",
    verticalAlign: "middle",
    color: "#34344c",
    fontSize: "11px",
    fontWeight: 700,
    borderBottom: "1px solid #efedf5",
  },

  subValue: {
    marginTop: "4px",
    color: "#6f8b9a",
    fontSize: "9px",
  },

  activityBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 8px",
    borderRadius: "7px",
    color: "#42dfba",
    background: "rgba(66,223,186,0.08)",
    border: "1px solid rgba(66,223,186,0.16)",
    fontSize: "9px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  emptyState: {
    minHeight: "280px",
    padding: "40px 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
  },

  emptyIcon: {
    width: "58px",
    height: "58px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "16px",
    background: "rgba(48,215,177,0.08)",
    border: "1px solid rgba(48,215,177,0.15)",
    fontSize: "25px",
    marginBottom: "14px",
  },

  emptyTitle: {
    margin: "0 0 7px",
    color: "#34344c",
    fontSize: "16px",
  },

  emptyText: {
    margin: 0,
    maxWidth: "420px",
    color: "#85869b",
    fontSize: "11px",
    lineHeight: 1.6,
  },

  errorText: {
    margin: "0 0 14px",
    maxWidth: "520px",
    color: "#ffb4b4",
    fontSize: "11px",
    lineHeight: 1.6,
  },

  retryButton: {
    border: "1px solid rgba(55,221,180,0.25)",
    background: "rgba(55,221,180,0.10)",
    color: "#55e5c1",
    borderRadius: "10px",
    padding: "9px 13px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },

  mobileCard: {
    margin: "12px",
    padding: "14px",
    borderRadius: "13px",
    border: "1px solid #e7e5f0",
    background: "rgba(255,255,255,0.025)",
  },

  mobileTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
  },

  mobileDate: {
    color: "#85869b",
    fontSize: "9px",
    textAlign: "right",
  },

  mobileRow: {
    display: "grid",
    gridTemplateColumns: "92px minmax(0,1fr)",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    textAlign: "left",
  },

  mobileLabel: {
    color: "#85869b",
    fontSize: "10px",
    fontWeight: 700,
  },

  mobileValue: {
    color: "#e8f3f8",
    fontSize: "10px",
    overflowWrap: "anywhere",
    textAlign: "left",
  },
};
