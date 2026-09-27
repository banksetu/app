import { useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
} from "react";

import CustomerEntry from "./CustomerEntry";
import Settings from "./Settings";
import AdvancedAdmin from "./AdvancedAdmin";

type DashboardProps = {
  onLogout: () => void;
};

type PageName =
  | "dashboard"
  | "customer-entry"
  | "customers"
  | "passbook"
  | "search"
  | "reports"
  | "settings"
  | "advanced-admin";

function Dashboard({ onLogout }: DashboardProps) {
  const [activePage, setActivePage] =
    useState<PageName>("dashboard");

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const [adminMenuOpen, setAdminMenuOpen] =
    useState(false);

  const [systemStatusOpen, setSystemStatusOpen] =
    useState(false);

  const logoInputRef =
    useRef<HTMLInputElement | null>(null);

  const [bankLogo, setBankLogo] =
    useState<string>(() => {
      return (
        localStorage.getItem(
          "bankSetuBankLogo"
        ) || ""
      );
    });

  const openPage = (page: PageName) => {
    setActivePage(page);
    setMobileMenuOpen(false);
    setAdminMenuOpen(false);
  };

  const handleLogoUpload = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(
        "Please select an image file."
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        return;
      }

      setBankLogo(result);

      try {
        localStorage.setItem(
          "bankSetuBankLogo",
          result
        );
      } catch (error) {
        console.error(
          "Logo save failed:",
          error
        );
      }
    };

    reader.readAsDataURL(file);

    event.target.value = "";
  };

  const openLogoPicker = () => {
    logoInputRef.current?.click();
  };

  const apiConfigured =
    !!localStorage.getItem(
      "bankSetuApiUrl"
    );

  return (
    <main style={styles.page}>
      {mobileMenuOpen && (
        <div
          style={styles.mobileOverlay}
          onClick={() =>
            setMobileMenuOpen(false)
          }
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`banksetu-sidebar ${
          mobileMenuOpen ? "open" : ""
        }`}
        style={styles.sidebar}
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.brandBox}>
            <div style={styles.appLogo} />

            <div>
              <h2 style={styles.brandTitle}>
                BANK{" "}
                <span style={styles.brandAccent}>
                  SETU
                </span>
              </h2>

              <p style={styles.brandSubtitle}>
                Smart CSP Management
              </p>
            </div>
          </div>

          <button
            type="button"
            className="mobile-close-button"
            style={styles.mobileCloseButton}
            onClick={() =>
              setMobileMenuOpen(false)
            }
          >
            ×
          </button>
        </div>

        <nav style={styles.nav}>
          <NavButton
            icon="🏠"
            label="Dashboard"
            active={
              activePage === "dashboard"
            }
            onClick={() =>
              openPage("dashboard")
            }
          />

          <NavButton
            icon="👤"
            label="Customer Entry"
            active={
              activePage ===
              "customer-entry"
            }
            onClick={() =>
              openPage("customer-entry")
            }
          />

          <NavButton
            icon="📋"
            label="Customers"
            active={
              activePage === "customers"
            }
            onClick={() =>
              openPage("customers")
            }
          />

          <NavButton
            icon="🖨"
            label="Passbook Print"
            active={
              activePage === "passbook"
            }
            onClick={() =>
              openPage("passbook")
            }
          />

          <NavButton
            icon="🔎"
            label="Universal Search"
            active={
              activePage === "search"
            }
            onClick={() =>
              openPage("search")
            }
          />

          <NavButton
            icon="📊"
            label="Reports"
            active={
              activePage === "reports"
            }
            onClick={() =>
              openPage("reports")
            }
          />

          <NavButton
            icon="⚙️"
            label="Settings"
            active={
              activePage === "settings"
            }
            onClick={() =>
              openPage("settings")
            }
          />
        </nav>
      </aside>

      {/* MAIN AREA */}

      <section style={styles.mainContent}>
        <header style={styles.topBar}>
          <button
            type="button"
            className="mobile-menu-button"
            style={styles.mobileMenuButton}
            onClick={() =>
              setMobileMenuOpen(true)
            }
          >
            ☰
          </button>

          <div style={styles.topBarSpacer} />

          <div style={styles.adminWrapper}>
            <button
              type="button"
              className="admin-trigger"
              style={styles.adminBox}
              onClick={() =>
                setAdminMenuOpen(
                  !adminMenuOpen
                )
              }
            >
              <div style={styles.adminAvatar}>
                A
              </div>

              <span
                className="admin-label"
                style={styles.adminLabel}
              >
                Admin
              </span>

              <span
                className="admin-arrow"
                style={styles.adminArrow}
              >
                {adminMenuOpen
                  ? "▲"
                  : "▼"}
              </span>
            </button>

            {adminMenuOpen && (
              <div style={styles.adminMenu}>
                <button
                  type="button"
                  style={styles.adminMenuItem}
                  onClick={() => {
                    alert(
                      "Password reset will be connected later."
                    );
                    setAdminMenuOpen(false);
                  }}
                >
                  🔐 Reset Password
                </button>

                <button
                  type="button"
                  style={styles.adminMenuItem}
                  onClick={() => {
                    setAdminMenuOpen(false);
                    setSystemStatusOpen(true);
                  }}
                >
                  📡 System Status
                </button>

                <button
                  type="button"
                  style={
                    styles.advancedAdminItem
                  }
                  onClick={() =>
                    openPage(
                      "advanced-admin"
                    )
                  }
                >
                  🛡 Advanced Administrator Control
                </button>

                <button
                  type="button"
                  style={
                    styles.adminMenuItemDanger
                  }
                  onClick={onLogout}
                >
                  ↪ Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* PERMANENT BANK AREA */}

        <section
          className="persistent-bank-header"
          style={styles.bankHeader}
        >
          <div
            className={`bank-logo-zone ${
              bankLogo ? "has-logo" : ""
            }`}
            style={styles.bankLogoZone}
          >
            {bankLogo ? (
              <>
                <img
                  src={bankLogo}
                  alt="Bank Logo"
                  style={styles.bankLogoImage}
                />

                <button
                  type="button"
                  className="logo-edit-pencil"
                  style={styles.logoEditButton}
                  onClick={openLogoPicker}
                  title="Edit Bank Logo"
                >
                  ✎
                </button>
              </>
            ) : (
              <button
                type="button"
                style={styles.firstLogoUpload}
                onClick={openLogoPicker}
              >
                <span style={styles.uploadLogoIcon}>
                  🏦
                </span>

                <span>
                  <strong>
                    Upload Bank Logo
                  </strong>

                  <small style={styles.uploadHint}>
                    Add your bank or CSP logo
                  </small>
                </span>
              </button>
            )}

            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ display: "none" }}
            />
          </div>

          <div style={styles.bankInfoStrip}>
            <p style={styles.bankInfoLabel}>
              BANK INFORMATION
            </p>

            <h2 style={styles.bankInfoTitle}>
              Your Bank / CSP Name
            </h2>

            <p style={styles.bankInfoText}>
              Branch name, CSP code,
              operator name and address
              can be displayed here.
            </p>

            <button
              type="button"
              style={styles.editInfoButton}
            >
              ✎ Edit Information
            </button>
          </div>
        </section>

        {/* PAGE CONTENT */}

        <div style={styles.pageContent}>
          {activePage === "dashboard" && (
            <DashboardHome
              openPage={openPage}
            />
          )}

          {activePage ===
            "customer-entry" && (
            <CustomerEntry />
          )}

          {activePage === "settings" && (
            <Settings />
          )}

          {activePage ===
            "advanced-admin" && (
            <AdvancedAdmin />
          )}

          {activePage === "customers" && (
            <ComingSoon
              title="Customers"
              text="Customer table will be added here."
            />
          )}

          {activePage === "passbook" && (
            <ComingSoon
              title="Passbook Print"
              text="Passbook module will be added here."
            />
          )}

          {activePage === "search" && (
            <ComingSoon
              title="Universal Search"
              text="Universal search will be added here."
            />
          )}

          {activePage === "reports" && (
            <ComingSoon
              title="Reports"
              text="Reports module will be added here."
            />
          )}
        </div>
      </section>

      {/* SYSTEM STATUS */}

      {systemStatusOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.statusModal}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.bankInfoLabel}>
                  SYSTEM STATUS
                </p>

                <h2 style={styles.modalTitle}>
                  Bank Setu Services
                </h2>
              </div>

              <button
                type="button"
                style={styles.modalClose}
                onClick={() =>
                  setSystemStatusOpen(false)
                }
              >
                ×
              </button>
            </div>

            <StatusRow
              name="Firebase Authentication"
              value="Connected"
              ok
            />

            <StatusRow
              name="Firebase Hosting"
              value="Online"
              ok
            />

            <StatusRow
              name="Google Sheet API"
              value={
                apiConfigured
                  ? "Configured"
                  : "Not Configured"
              }
              ok={apiConfigured}
            />
          </div>
        </div>
      )}

      <style>
        {`
          .mobile-menu-button,
          .mobile-close-button {
            display: none !important;
          }

          .logo-edit-pencil {
            opacity: 0;
            transform: scale(0.9);
            transition:
              opacity 0.18s ease,
              transform 0.18s ease;
          }

          .bank-logo-zone.has-logo:hover
          .logo-edit-pencil {
            opacity: 1;
            transform: scale(1);
          }

          @media (hover: none) {
            .bank-logo-zone.has-logo
            .logo-edit-pencil {
              opacity: 0.85;
              transform: scale(1);
            }
          }

          @media (max-width: 900px) {
            .dashboard-quick-grid {
              grid-template-columns:
                repeat(
                  2,
                  minmax(0, 1fr)
                ) !important;
            }
          }

          @media (max-width: 760px) {
            .banksetu-sidebar {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              z-index: 1500 !important;
              transform:
                translateX(-110%);
              transition:
                transform 0.25s ease;
              box-shadow:
                18px 0 50px
                rgba(0,0,0,0.48);
            }

            .banksetu-sidebar.open {
              transform:
                translateX(0);
            }

            .mobile-menu-button,
            .mobile-close-button {
              display:
                inline-flex !important;
            }

            .admin-label,
            .admin-arrow {
              display: none !important;
            }

            .admin-trigger {
              min-width:
                42px !important;
              width:
                42px !important;
              height:
                42px !important;
              padding:
                3px !important;
              justify-content:
                center !important;
            }

            .persistent-bank-header {
              grid-template-columns:
                1fr !important;
            }

            .dashboard-quick-grid {
              grid-template-columns:
                1fr !important;
            }
          }
        `}
      </style>
    </main>
  );
}

/* =========================
   DASHBOARD HOME
========================= */

function DashboardHome({
  openPage,
}: {
  openPage: (page: PageName) => void;
}) {
  const stats = [
    ["👥", "Total Customers"],
    ["🪪", "KYC Pending"],
    ["📘", "Passbook Pending"],
    ["⏸", "Inactive Accounts"],
  ];

  return (
    <>
      <section style={styles.statsGrid}>
        {stats.map(([icon, title]) => (
          <article
            key={title}
            style={styles.statCard}
          >
            <div style={styles.statTop}>
              <div style={styles.statIcon}>
                {icon}
              </div>

              <span style={styles.statBadge}>
                LIVE
              </span>
            </div>

            <div style={styles.statValue}>
              0
            </div>

            <h3 style={styles.statTitle}>
              {title}
            </h3>
          </article>
        ))}
      </section>

      <section style={styles.panel}>
        <div style={styles.centerHeading}>
          <p style={styles.bankInfoLabel}>
            QUICK ACCESS
          </p>

          <h2 style={styles.panelTitle}>
            Quick Actions
          </h2>
        </div>

        <div
          className="dashboard-quick-grid"
          style={styles.quickGrid}
        >
          <QuickAction
            icon="➕"
            title="Add Customer"
            text="Create a new customer record"
            onClick={() =>
              openPage("customer-entry")
            }
          />

          <QuickAction
            icon="📄"
            title="Upload PDF"
            text="Import account opening PDF"
            onClick={() =>
              openPage("customer-entry")
            }
          />

          <QuickAction
            icon="🖨"
            title="Passbook Print"
            text="Search and print passbook"
            onClick={() =>
              openPage("passbook")
            }
          />

          <QuickAction
            icon="🔎"
            title="Universal Search"
            text="Search any customer instantly"
            onClick={() =>
              openPage("search")
            }
          />
        </div>
      </section>
    </>
  );
}

function QuickAction({
  icon,
  title,
  text,
  onClick,
}: {
  icon: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={styles.quickCard}
      onClick={onClick}
    >
      <div style={styles.quickIcon}>
        {icon}
      </div>

      <div style={styles.quickText}>
        <strong>
          {title}
        </strong>

        <span>
          {text}
        </span>
      </div>

      <span style={styles.quickArrow}>
        →
      </span>
    </button>
  );
}

/* =========================
   NAV
========================= */

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? styles.navActive
          : styles.navButton
      }
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

/* =========================
   COMING SOON
========================= */

function ComingSoon({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <section style={styles.comingSoon}>
      <div style={styles.comingSoonIcon}>
        🛠
      </div>

      <h2>
        {title}
      </h2>

      <p>
        {text}
      </p>
    </section>
  );
}

/* =========================
   STATUS ROW
========================= */

function StatusRow({
  name,
  value,
  ok,
}: {
  name: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div style={styles.statusRow}>
      <span>
        {ok ? "🟢" : "🟠"}
      </span>

      <span>
        {name}
      </span>

      <strong style={styles.statusValue}>
        {value}
      </strong>
    </div>
  );
}

/* =========================
   STYLES
========================= */

const styles: Record<
  string,
  CSSProperties
> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    background:
      "radial-gradient(circle at 12% 12%, rgba(0,205,170,0.08), transparent 30%), radial-gradient(circle at 85% 10%, rgba(0,120,255,0.08), transparent 35%), linear-gradient(145deg,#04131b 0%,#071c28 48%,#082634 100%)",
    color: "#f7fbff",
    fontFamily:
      "Inter, Arial, sans-serif",
  },

  mobileOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1400,
    background:
      "rgba(0,0,0,0.62)",
    backdropFilter: "blur(3px)",
  },

  sidebar: {
    width: "260px",
    height: "100vh",
    boxSizing: "border-box",
    padding: "24px 18px",
    position: "sticky",
    top: 0,
    flexShrink: 0,
    overflowY: "auto",
    background:
      "linear-gradient(180deg,#06151e,#071b27)",
    borderRight:
      "1px solid rgba(62,207,188,0.12)",
  },

  sidebarHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
  },

  brandBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "32px",
  },

  appLogo: {
    width: "46px",
    height: "46px",
    borderRadius: "13px",
    flexShrink: 0,
    backgroundImage:
      'url("/src/assets/bank-setu-logo.png")',
    backgroundSize: "cover",
    backgroundPosition: "center",
  },

  brandTitle: {
    margin: 0,
    color: "#fff",
    fontSize: "16px",
  },

  brandAccent: {
    color: "#37e0c4",
  },

  brandSubtitle: {
    margin: "4px 0 0",
    color: "#7995a8",
    fontSize: "9px",
  },

  mobileCloseButton: {
    width: "34px",
    height: "34px",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "22px",
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  navButton: {
    width: "100%",
    padding: "13px 14px",
    display: "flex",
    alignItems: "center",
    gap: "11px",
    border: "none",
    borderRadius: "12px",
    background: "transparent",
    color: "#b0c0cc",
    cursor: "pointer",
    textAlign: "left",
  },

  navActive: {
    width: "100%",
    padding: "13px 14px",
    display: "flex",
    alignItems: "center",
    gap: "11px",
    border:
      "1px solid rgba(45,220,190,0.2)",
    borderRadius: "12px",
    background:
      "linear-gradient(90deg,rgba(37,214,183,0.13),rgba(0,135,255,0.06))",
    color: "#47e4c9",
    cursor: "pointer",
    textAlign: "left",
  },

  mainContent: {
    flex: 1,
    minWidth: 0,
    padding: "20px 32px 45px",
  },

  topBar: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "16px",
  },

  topBarSpacer: {
    flex: 1,
  },

  mobileMenuButton: {
    width: "42px",
    height: "42px",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "20px",
  },

  adminWrapper: {
    position: "relative",
  },

  adminBox: {
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding:
      "5px 10px 5px 5px",
    borderRadius: "14px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.045)",
    color: "#fff",
    cursor: "pointer",
  },

  adminAvatar: {
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "11px",
    background:
      "linear-gradient(135deg,#39e0c5,#28a9e8)",
    color: "#032127",
    fontWeight: 800,
  },

  adminLabel: {
    color: "#fff",
    fontSize: "11px",
    fontWeight: 700,
  },

  adminArrow: {
    color: "#8ca2b0",
    fontSize: "7px",
  },

  adminMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    width: "245px",
    padding: "7px",
    zIndex: 1000,
    borderRadius: "13px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background: "#071a24",
    boxShadow:
      "0 18px 40px rgba(0,0,0,0.45)",
  },

  adminMenuItem: {
    width: "100%",
    padding: "11px 12px",
    border: "none",
    borderRadius: "10px",
    background: "transparent",
    color: "#d4e1e8",
    textAlign: "left",
    cursor: "pointer",
  },

  advancedAdminItem: {
    width: "100%",
    padding: "11px 12px",
    marginTop: "3px",
    border:
      "1px solid rgba(55,220,195,0.08)",
    borderRadius: "10px",
    background:
      "rgba(55,220,195,0.04)",
    color: "#4be2c8",
    textAlign: "left",
    cursor: "pointer",
  },

  adminMenuItemDanger: {
    width: "100%",
    padding: "11px 12px",
    border: "none",
    borderRadius: "10px",
    background: "transparent",
    color: "#ff9090",
    textAlign: "left",
    cursor: "pointer",
  },

  bankHeader: {
    display: "grid",
    gridTemplateColumns:
      "minmax(250px,0.75fr) minmax(300px,1.25fr)",
    gap: "15px",
    marginBottom: "22px",
  },

  bankLogoZone: {
    minHeight: "118px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: "14px",
    boxSizing: "border-box",
    borderRadius: "18px",
    border:
      "1px solid rgba(63,220,194,0.14)",
    background:
      "linear-gradient(145deg,#092631,#0a303c)",
  },

  bankLogoImage: {
    width: "100%",
    maxWidth: "360px",
    height: "94px",
    objectFit: "contain",
  },

  firstLogoUpload: {
    width: "100%",
    minHeight: "86px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    border:
      "1px dashed rgba(62,220,194,0.26)",
    borderRadius: "14px",
    background:
      "rgba(51,219,190,0.035)",
    color: "#fff",
    cursor: "pointer",
  },

  uploadLogoIcon: {
    fontSize: "29px",
  },

  uploadHint: {
    display: "block",
    marginTop: "4px",
    color: "#91a7b3",
    fontSize: "9px",
  },

  logoEditButton: {
    position: "absolute",
    right: "10px",
    top: "10px",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,255,255,0.14)",
    background:
      "rgba(3,20,27,0.88)",
    color: "#55e5cc",
    cursor: "pointer",
    fontSize: "16px",
  },

  bankInfoStrip: {
    minHeight: "118px",
    padding: "18px 20px",
    boxSizing: "border-box",
    borderRadius: "18px",
    border:
      "1px solid rgba(0,164,220,0.12)",
    background:
      "linear-gradient(145deg,#091f2a,#0a2936)",
  },

  bankInfoLabel: {
    margin: 0,
    color: "#45dbc3",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.4px",
  },

  bankInfoTitle: {
    margin: "6px 0 6px",
    color: "#fff",
    fontSize: "18px",
  },

  bankInfoText: {
    margin: 0,
    color: "#98abb7",
    fontSize: "9px",
    lineHeight: 1.5,
  },

  editInfoButton: {
    marginTop: "11px",
    padding: "7px 11px",
    borderRadius: "9px",
    border:
      "1px solid rgba(255,255,255,0.07)",
    background:
      "rgba(255,255,255,0.035)",
    color: "#d6e2e8",
    cursor: "pointer",
    fontSize: "9px",
  },

  pageContent: {
    width: "100%",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(190px,1fr))",
    gap: "16px",
    marginBottom: "20px",
  },

  statCard: {
    padding: "20px",
    borderRadius: "18px",
    border:
      "1px solid rgba(255,255,255,0.06)",
    background:
      "linear-gradient(145deg,#0a2430,#0b2a37)",
  },

  statTop: {
    display: "flex",
    justifyContent:
      "space-between",
    marginBottom: "20px",
  },

  statIcon: {
    width: "42px",
    height: "42px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "13px",
    background:
      "rgba(55,219,194,0.09)",
  },

  statBadge: {
    color: "#46dfc5",
    fontSize: "8px",
    fontWeight: 700,
  },

  statValue: {
    color: "#fff",
    fontSize: "29px",
    fontWeight: 800,
  },

  statTitle: {
    margin: "6px 0 0",
    color: "#fff",
    fontSize: "12px",
  },

  panel: {
    padding: "21px",
    borderRadius: "18px",
    background:
      "linear-gradient(145deg,#09232f,#0b2935)",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  centerHeading: {
    textAlign: "center",
    marginBottom: "18px",
  },

  panelTitle: {
    margin: "5px 0 0",
    color: "#fff",
    fontSize: "17px",
  },

  quickGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4,minmax(0,1fr))",
    gap: "12px",
  },

  quickCard: {
    minWidth: 0,
    width: "100%",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    gap: "11px",
    border:
      "1px solid rgba(255,255,255,0.065)",
    borderRadius: "14px",
    background: "#0b2b38",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },

  quickIcon: {
    width: "37px",
    height: "37px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "11px",
    background:
      "rgba(50,218,192,0.09)",
  },

  quickText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    fontSize: "11px",
  },

  quickArrow: {
    color: "#4ce0c6",
  },

  comingSoon: {
    minHeight: "300px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    borderRadius: "18px",
    background:
      "linear-gradient(145deg,#09232f,#0b2935)",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  comingSoonIcon: {
    fontSize: "34px",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    background:
      "rgba(0,0,0,0.65)",
    backdropFilter: "blur(6px)",
  },

  statusModal: {
    width: "100%",
    maxWidth: "500px",
    padding: "22px",
    borderRadius: "20px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background: "#071c26",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "16px",
  },

  modalTitle: {
    margin: "6px 0 0",
    color: "#fff",
    fontSize: "20px",
  },

  modalClose: {
    width: "35px",
    height: "35px",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "20px",
  },

  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "13px",
    marginTop: "10px",
    borderRadius: "12px",
    background: "#0a2834",
    color: "#c6d4dc",
    fontSize: "10px",
  },

  statusValue: { 
    marginLeft: "auto",
  },
};

export default Dashboard;