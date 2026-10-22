import MasterSystemStatus from "./MasterSystemStatus";
import AdminUsers from "./AdminUsers";

type SettingsProps = {
  userRole: "admin" | "user";
};

function Settings({ userRole }: SettingsProps) {
  if (userRole !== "admin") {
    return null;
  }

  return (
    <section className="settings-page" style={{ display: "grid", gap: 18 }}>
      <div
        className="settings-admin-hero"
        style={{
          padding: "20px",
          borderRadius: "16px",
          border: "1px solid rgba(69,223,197,0.16)",
          background: "rgba(6,29,40,0.86)",
          color: "var(--app-dark-text, #fff)",
        }}
      >
        <p style={{ margin: 0, color: "var(--app-dark-text, #45dfc5)", fontSize: 11, fontWeight: 800 }}>
          ADMIN SETTINGS
        </p>
        <h2 style={{ margin: "7px 0 5px", color: "var(--app-dark-text, #fff)" }}>Accounts & Access</h2>
        <p style={{ margin: 0, color: "var(--app-dark-text, #9db2bd)", fontSize: 12, lineHeight: 1.6 }}>
          View your administrators, client workspaces and users. Manage their access from one place.
        </p>
      </div>
      <AdminUsers embedded />
      {["master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"") && <MasterSystemStatus />}
    </section>
  );
}

export default Settings;
