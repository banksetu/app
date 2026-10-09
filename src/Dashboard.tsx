import { useSyncStatus } from "./core/useSyncStatus";
import {startPresence} from "./core/presence";
import LocalSyncStatus from "./LocalSyncStatus";
import SlideNotifications from "./SlideNotifications";
import SupportCenter, { useSupportUnread } from "./SupportCenter";
import { localDataFetch, getDataIdToken, getActiveLocalCustomers, localModeEnabled } from "./core/localData";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import {

  doc,


  onSnapshot,


  setDoc,

} from "firebase/firestore";

import { db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
import { prepareBankLogo, restoreWorkspaceBankSettings } from "./workspaceBankSettings";
import { getTenantApiUrl, setTenantApiUrl, tenantSettingsPath, tenantStorageKey } from "./tenantApi";

import type {

  ChangeEvent,

  CSSProperties,

} from "react";

import CustomerEntry from "./CustomerEntry";

import Settings from "./Settings";
import AdvancedAdmin from "./AdvancedAdmin";
import MasterClients from "./MasterClients";
import ClientGoogleSetup from "./ClientGoogleSetup";
import BankFormats from "./BankFormats";


import SelectedBankDocument from "./SelectedBankDocument";

import Customers from "./Customers";
import AllCustomerData from "./AllCustomerData";

import Reports from "./Reports";



import bankSetuLogo from "./assets/bank-setu-logo.png";

type DashboardProps = {

  onLogout: () => void;
  userRole: "admin" | "user";
  accountRole: string;

};

type BankInfo = {

  bankName: string;

  passbookBank: string;

  branchName: string;

  cspCode: string;

  operatorName: string;

  address: string;

};

const emptyBankInfo: BankInfo = {

  bankName: "",

  passbookBank: "",

  branchName: "",

  cspCode: "",

  operatorName: "",

  address: "",

};

const PASSBOOK_BANK_OPTIONS = [

  "Assam Gramin Bank",

  "Union Bank of India",

  "State Bank of India (SBI)",

  "Punjab Bank of India",

  "Canara Bank of India",

  "Airtel Bank",

] as const;

type DashboardThemeId =

  | "soft-mist"

  | "pearl-blue"

  | "cool-grey"
  | "ocean-blue"
  | "emerald"
  | "royal-purple"
  | "warm-sunset"
  | "midnight"
  | "dark-original";

const DASHBOARD_THEMES: Array<{

  id: DashboardThemeId;

  name: string;

  preview: string;

  background: string;

}> = [

  {

    id: "soft-mist",

    name: "Soft Mist",

    preview: "#e7f0f1",

    background:

      "radial-gradient(circle at 15% 8%, rgba(55,219,194,0.14), transparent 30%), radial-gradient(circle at 88% 12%, rgba(40,169,232,0.12), transparent 34%), linear-gradient(145deg,#edf4f4 0%,#e3edef 52%,#dbe8eb 100%)",

  },

  {

    id: "pearl-blue",

    name: "Pearl Blue",

    preview: "#dbe9ef",

    background:

      "radial-gradient(circle at 12% 10%, rgba(57,224,197,0.12), transparent 30%), linear-gradient(145deg,#e9f2f5 0%,#dce9ee 52%,#d2e3e9 100%)",

  },

  {

    id: "cool-grey",

    name: "Cool Grey",

    preview: "#e6eaed",

    background:

      "radial-gradient(circle at 82% 10%, rgba(40,169,232,0.10), transparent 32%), linear-gradient(145deg,#f0f3f4 0%,#e4e9eb 50%,#dce3e6 100%)",

  },

  { id: "ocean-blue", name: "Ocean Blue", preview: "#176b87", background: "linear-gradient(145deg,#0b3141 0%,#176b87 55%,#0b465d 100%)" },
  { id: "emerald", name: "Emerald", preview: "#176b55", background: "linear-gradient(145deg,#082c26 0%,#176b55 55%,#0b4438 100%)" },
  { id: "royal-purple", name: "Royal Purple", preview: "#60459b", background: "linear-gradient(145deg,#24183d 0%,#60459b 55%,#35225c 100%)" },
  { id: "warm-sunset", name: "Warm Sunset", preview: "#9a553e", background: "linear-gradient(145deg,#3d211b 0%,#9a553e 55%,#5e3027 100%)" },
  { id: "midnight", name: "Midnight", preview: "#17243a", background: "linear-gradient(145deg,#080f1c 0%,#17243a 55%,#0d1728 100%)" },

  {

    id: "dark-original",

    name: "Dark Original",

    preview: "#071c28",

    background:

      "radial-gradient(circle at 12% 12%, rgba(0,205,170,0.08), transparent 30%), radial-gradient(circle at 85% 10%, rgba(0,120,255,0.08), transparent 35%), linear-gradient(145deg,#04131b 0%,#071c28 48%,#082634 100%)",

  },

];

const MENU_THEMES = [
  ["violet","Vibrant Violet","#6d5dfc","#8b5cf6","#5643c8"], ["royal","Royal Purple","#4f46e5","#7c3aed","#9333ea"],
  ["berry","Berry Pop","#7c3aed","#c026d3","#ec4899"], ["magenta","Magenta Dream","#a21caf","#db2777","#f43f5e"],
  ["rose","Rose Glow","#be123c","#e11d48","#fb7185"], ["sunset","Sunset","#c2410c","#db2777","#7c3aed"],
  ["coral","Coral Punch","#ea580c","#f43f5e","#db2777"], ["orange","Orange Flame","#c2410c","#f97316","#f59e0b"],
  ["gold","Golden Hour","#b45309","#f59e0b","#facc15"], ["lime","Lime Fresh","#3f6212","#65a30d","#84cc16"],
  ["emerald","Emerald Glow","#065f46","#059669","#10b981"], ["mint","Mint Wave","#0f766e","#14b8a6","#5eead4"],
  ["teal","Teal Lagoon","#115e59","#0d9488","#06b6d4"], ["ocean","Ocean Blue","#075985","#0284c7","#22d3ee"],
  ["sky","Sky Rush","#0369a1","#0ea5e9","#6366f1"], ["blue","Electric Blue","#1d4ed8","#2563eb","#06b6d4"],
  ["indigo","Indigo Night","#312e81","#4f46e5","#7c3aed"], ["plum","Plum Velvet","#581c87","#7e22ce","#c026d3"],
  ["grape","Grape Soda","#4c1d95","#7c3aed","#d946ef"], ["aurora","Aurora","#0f766e","#4f46e5","#c026d3"],
  ["tropical","Tropical","#059669","#06b6d4","#6366f1"], ["candy","Candy","#ec4899","#8b5cf6","#3b82f6"],
  ["fire","Firestorm","#991b1b","#ea580c","#f59e0b"], ["forest","Deep Forest","#14532d","#047857","#0f766e"],
  ["slate","Slate Blue","#334155","#475569","#4f46e5"], ["midnight","Midnight","#0f172a","#1e293b","#334155"],
  ["cosmic","Cosmic","#111827","#4338ca","#a21caf"], ["neon","Neon Night","#172554","#6d28d9","#db2777"],
  ["lavender","Lavender","#7c3aed","#a78bfa","#c084fc"], ["peacock","Peacock","#164e63","#0e7490","#7c3aed"]
].map(([id,name,a,b,c]) => ({ id, name, preview:`linear-gradient(135deg,${a},${b},${c})`, background:`linear-gradient(180deg,${a} 0%,${b} 52%,${c} 100%)` })) as Array<{id:string;name:string;preview:string;background:string}>;

type MenuThemeId = string;

const isMenuThemeId = (value: unknown): value is MenuThemeId => MENU_THEMES.some((theme) => theme.id === value);

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#ef4444 0%,#fb7185 55%,#f97316 100%)",
  "linear-gradient(135deg,#7c3aed 0%,#c084fc 55%,#2563eb 100%)",
  "linear-gradient(135deg,#059669 0%,#34d399 55%,#0ea5e9 100%)",
  "linear-gradient(135deg,#d97706 0%,#fbbf24 55%,#f97316 100%)",
];

const isDashboardThemeId = (value: unknown): value is DashboardThemeId =>

  DASHBOARD_THEMES.some((theme) => theme.id === value);

type PageName =

  | "dashboard"

  | "customer-entry"

  | "customers"
  | "all-customer-data"

  | "passbook"

  | "quick-passbook"
  | "bank-formats"

  | "search"

  | "reports"

  | "settings"
  | "sync-backup"
  | "support";

function Dashboard({ onLogout, userRole, accountRole }: DashboardProps) {
  useEffect(()=>startPresence(),[]);

  // The verified legacy Master Admin is represented as `admin` for backward
  // compatibility. It has the same global appearance permissions as the
  // newer `master_owner` role; client roles remain excluded.
  const canControlGlobalDashboard = accountRole === "master_owner" || accountRole === "admin";

  const syncStatus=useSyncStatus();
  const supportUnread=useSupportUnread(accountRole);
  const syncDashboard=()=>{window.dispatchEvent(new CustomEvent("banksetu-sync-request",{detail:{refresh:true}}));};
  const [activePage, setActivePage] =

    useState<PageName>("dashboard");

  const [mobileMenuOpen, setMobileMenuOpen] =

    useState(false);

  const [adminMenuOpen, setAdminMenuOpen] =

    useState(false);
  const adminTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [adminMenuPosition, setAdminMenuPosition] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (!adminMenuOpen) return;
    const positionMenu = () => {
      const rect = adminTriggerRef.current?.getBoundingClientRect();
      if (rect) setAdminMenuPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [adminMenuOpen]);

  const [systemStatusOpen, setSystemStatusOpen] =

    useState(false);

  const [passwordModalOpen, setPasswordModalOpen] =

    useState(false);

  const [currentPassword, setCurrentPassword] =

    useState("");

  const [newPassword, setNewPassword] =

    useState("");

  const [confirmPassword, setConfirmPassword] =

    useState("");

  const [passwordLoading, setPasswordLoading] =

    useState(false);

  const [passwordError, setPasswordError] =

    useState("");


  const [themeModalOpen, setThemeModalOpen] =

    useState(false);

  const [menuThemeModalOpen, setMenuThemeModalOpen] = useState(false);
  const [menuTheme, setMenuTheme] = useState<MenuThemeId>(() => {
    const saved = localStorage.getItem(tenantStorageKey("bankSetuMenuTheme"));
    return isMenuThemeId(saved) ? saved : "violet";
  });
  const selectedMenuTheme = MENU_THEMES.find((theme) => theme.id === menuTheme) || MENU_THEMES[0];
  const [advancedAdminOpen, setAdvancedAdminOpen] = useState(false);
  const [clientCreateOpen, setClientCreateOpen] = useState(false);

  const [customDashboardColor, setCustomDashboardColor] = useState(() =>
    localStorage.getItem(tenantStorageKey("bankSetuCustomDashboardColor")) || "#123b4a"
  );

  const [useCustomDashboardColor, setUseCustomDashboardColor] = useState(() =>
    localStorage.getItem(tenantStorageKey("bankSetuUseCustomDashboardColor")) === "true"
  );

  const [dashboardTheme, setDashboardTheme] =

    useState<DashboardThemeId>(() => {

      const savedTheme = localStorage.getItem(tenantStorageKey("bankSetuDashboardTheme"));

      return savedTheme === "soft-mist"

        ? "dark-original"

        : isDashboardThemeId(savedTheme)

          ? savedTheme

          : "dark-original";

    });

  const selectedDashboardTheme =

    DASHBOARD_THEMES.find(

      (theme) => theme.id === dashboardTheme

    ) || DASHBOARD_THEMES[0];

  const logoInputRef =

    useRef<HTMLInputElement | null>(null);

  const [bankLogo, setBankLogo] = useState("");
  const [bankInfo, setBankInfo] = useState<BankInfo>(emptyBankInfo);
  const [bankSettingsReady, setBankSettingsReady] = useState(false);
  const [bankSettingsError, setBankSettingsError] = useState("");
  const [bankSettingsRetry, setBankSettingsRetry] = useState(0);
  const canManageBankSettings = accountRole === "client_admin" || accountRole === "master_owner" || accountRole === "admin";

  const [bankInfoDraft, setBankInfoDraft] =

    useState<BankInfo>(emptyBankInfo);

  const [bankInfoEditOpen, setBankInfoEditOpen] =

    useState(false);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    setBankSettingsReady(false); setBankSettingsError("");
    let receivedServer = false;
    const timeout = window.setTimeout(() => {
      if (!receivedServer) setBankSettingsError("Saved bank settings could not be confirmed from Firebase. Check your connection and retry.");
    }, 12000);
    const unsubscribe = onSnapshot(doc(db, ...tenantSettingsPath(user.uid)), { includeMetadataChanges:true }, snapshot => {
      if (snapshot.metadata.fromCache && !receivedServer && navigator.onLine) return;
      if(snapshot.metadata.fromCache && !snapshot.exists()) return;
      receivedServer = true; window.clearTimeout(timeout);
      const cloudData = snapshot.exists() ? snapshot.data() : {};
      const saved = restoreWorkspaceBankSettings(cloudData);
      if (typeof cloudData.apiUrl === "string") setTenantApiUrl(cloudData.apiUrl);
      setBankInfo(saved.bankInfo); setBankLogo(saved.bankLogo);
      setBankSettingsReady(true); setBankSettingsError("");
      // This is only a workspace-scoped cache. It never overrides Firebase.
      try {
        localStorage.setItem(tenantStorageKey("bankSetuBankInfo"),JSON.stringify(saved.bankInfo));
        if(saved.bankLogo) localStorage.setItem(tenantStorageKey("bankSetuBankLogo"),saved.bankLogo);
        else localStorage.removeItem(tenantStorageKey("bankSetuBankLogo"));
      } catch { /* Saving Firebase settings does not depend on browser storage. */ }
    }, error => {
      window.clearTimeout(timeout); setBankSettingsReady(false);
      setBankSettingsError("Saved bank settings could not be loaded from Firebase. Please retry.");
      console.error("Workspace bank settings listener failed:", error);
    });
    return () => { window.clearTimeout(timeout); unsubscribe(); };
  }, [bankSettingsRetry, accountRole]);

  const hasBankInfo =

    Object.values(bankInfo).some(

      (value) => value.trim() !== ""

    );

  const openBankInfoEditor = () => {
    if (!canManageBankSettings || !bankSettingsReady || !navigator.onLine) return;

    setBankInfoDraft({ ...bankInfo });

    setBankInfoEditOpen(true);

  };

  const updateBankInfoDraft = (

    field: keyof BankInfo,

    value: string

  ) => {

    setBankInfoDraft((current) => ({

      ...current,

      [field]: value,

    }));

  };

  const saveBankInfo = async () => {

    const cleaned: BankInfo = {

      bankName: bankInfoDraft.bankName.trim(),

      passbookBank: bankInfoDraft.passbookBank.trim(),

      branchName: bankInfoDraft.branchName.trim(),

      cspCode: bankInfoDraft.cspCode.trim(),

      operatorName: bankInfoDraft.operatorName.trim(),

      address: bankInfoDraft.address.trim(),

    };

    if (!cleaned.bankName) {

      alert("Please enter Bank / CSP Name.");

      return;

    }

    if (!cleaned.passbookBank) {

      alert("Please select the bank for passbook printing.");

      return;

    }

    try {

      await callBankSetuWorker("/save-workspace-bank-settings", { bankInfo:cleaned });

      setBankInfo(cleaned);

      try { localStorage.setItem(tenantStorageKey("bankSetuBankInfo"), JSON.stringify(cleaned)); } catch { /* Firebase save already succeeded. */ }

      setBankInfoEditOpen(false);

    } catch (error) {

      console.error(

        "Bank information cloud save failed:",

        error

      );

      alert(

        "Bank information could not be saved to Firebase Cloud. Please check your internet connection and try again."

      );

    }

  };

  // Master-controlled appearance is stored once and read by every tenant.
  const saveGlobalUiTheme = async (patch: Record<string, unknown>) => {
    const user = getAuth().currentUser;
    if (!user || !canControlGlobalDashboard) return;

    await setDoc(
      doc(db, "appSettings", "uiTheme"),
      {
        dashboardTheme,
        menuTheme,
        ...patch,
        updatedBy: user.uid,
      },
      { merge: true }
    );
  };

  useEffect(() => {
    if (!getAuth().currentUser) return;
    return onSnapshot(doc(db, "appSettings", "uiTheme"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (typeof data.customDashboardColor === "string" && data.useCustomDashboardColor === true) {
        setCustomDashboardColor(data.customDashboardColor);
        setUseCustomDashboardColor(true);
        localStorage.setItem(tenantStorageKey("bankSetuCustomDashboardColor"), data.customDashboardColor);
        localStorage.setItem(tenantStorageKey("bankSetuUseCustomDashboardColor"), "true");
      } else if (isDashboardThemeId(data.dashboardTheme)) {
        setDashboardTheme(data.dashboardTheme);
        setUseCustomDashboardColor(false);
        localStorage.setItem(tenantStorageKey("bankSetuDashboardTheme"), data.dashboardTheme);
        localStorage.setItem(tenantStorageKey("bankSetuUseCustomDashboardColor"), "false");
      }
      if (isMenuThemeId(data.menuTheme)) {
        setMenuTheme(data.menuTheme);
        localStorage.setItem(tenantStorageKey("bankSetuMenuTheme"), data.menuTheme);
      }
    }, (error) => console.error("Global UI theme listener failed:", error));
  }, [canControlGlobalDashboard]);

  const changeDashboardTheme = async (themeId: DashboardThemeId) => {
    setDashboardTheme(themeId);
    setUseCustomDashboardColor(false);
    localStorage.setItem(tenantStorageKey("bankSetuUseCustomDashboardColor"), "false");
    localStorage.setItem(tenantStorageKey("bankSetuDashboardTheme"), themeId);

    try {
      await saveGlobalUiTheme({
        dashboardTheme: themeId,
        useCustomDashboardColor: false,
      });
    } catch (error) {
      console.error("Dashboard theme cloud save failed:", error);
      alert("Dashboard theme could not be saved globally. Please try again.");
    }

    setThemeModalOpen(false);
  };

  const changeMenuTheme = async (themeId: MenuThemeId) => {
    setMenuTheme(themeId);
    localStorage.setItem(tenantStorageKey("bankSetuMenuTheme"), themeId);

    try {
      await saveGlobalUiTheme({ menuTheme: themeId });
    } catch (error) {
      console.error("Menu theme cloud save failed:", error);
      alert("Menu theme could not be saved globally. Please try again.");
    }

    setMenuThemeModalOpen(false);
  };

  const closePasswordModal = () => {

    if (passwordLoading) return;

    setPasswordModalOpen(false);

    setCurrentPassword("");

    setNewPassword("");

    setConfirmPassword("");

    setPasswordError("");

  };

  const openPasswordModal = () => {

    setAdminMenuOpen(false);

    setPasswordError("");

    setCurrentPassword("");

    setNewPassword("");

    setConfirmPassword("");

    setPasswordModalOpen(true);

  };

  const changeAdminPassword = async () => {

    setPasswordError("");

    const user = getAuth().currentUser;

    if (!user || !user.email) {

      setPasswordError(

        "Admin login session is not available. Please login again."

      );

      return;

    }

    if (!currentPassword) {

      setPasswordError("Please enter your current password.");

      return;

    }

    if (newPassword.length < 6) {

      setPasswordError(

        "New password must be at least 6 characters."

      );

      return;

    }

    if (newPassword !== confirmPassword) {

      setPasswordError(

        "New password and confirm password do not match."

      );

      return;

    }

    if (currentPassword === newPassword) {

      setPasswordError(

        "New password must be different from the current password."

      );

      return;

    }

    try {

      setPasswordLoading(true);

      const credential = EmailAuthProvider.credential(

        user.email,

        currentPassword

      );

      await reauthenticateWithCredential(

        user,

        credential

      );

      await updatePassword(user, newPassword);

      setPasswordModalOpen(false);

      setCurrentPassword("");

      setNewPassword("");

      setConfirmPassword("");

      alert("Admin password changed successfully.");

    } catch (error) {

      console.error("Admin password change failed:", error);

      const code =

        typeof error === "object" &&

        error !== null &&

        "code" in error

          ? String((error as { code?: unknown }).code || "")

          : "";

      if (

        code === "auth/invalid-credential" ||

        code === "auth/wrong-password"

      ) {

        setPasswordError("Current password is incorrect.");

      } else if (code === "auth/weak-password") {

        setPasswordError(

          "New password is too weak. Please use at least 6 characters."

        );

      } else if (code === "auth/too-many-requests") {

        setPasswordError(

          "Too many attempts. Please wait a little and try again."

        );

      } else if (code === "auth/network-request-failed") {

        setPasswordError(

          "Network error. Please check your internet connection."

        );

      } else {

        setPasswordError(

          "Password could not be changed. Please try again."

        );

      }

    } finally {

      setPasswordLoading(false);

    }

  };

  const openPage = (page: PageName) => {

    setActivePage(page);

    setMobileMenuOpen(false);

    setAdminMenuOpen(false);

  };

  const handleLogoUpload = async (event:ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0]; event.target.value="";
    if(!file || !canManageBankSettings || !bankSettingsReady) return;
    try {
      const bankLogo=await prepareBankLogo(file);
      await callBankSetuWorker("/save-workspace-bank-settings", {bankLogo});
      setBankLogo(bankLogo);
      try { localStorage.setItem(tenantStorageKey("bankSetuBankLogo"),bankLogo); } catch { /* Firebase save already succeeded. */ }
    } catch(error) {
      alert(error instanceof Error ? error.message : "The bank logo could not be saved to Firebase.");
    }
  };

  const openLogoPicker = () => {
    if (!canManageBankSettings || !bankSettingsReady || !navigator.onLine) return;

    logoInputRef.current?.click();

  };

  const apiConfigured =

    !!getTenantApiUrl();

  return (

    <main className="banksetu-app-shell" style={{ ...styles.page, "--dashboard-bg": useCustomDashboardColor ? `linear-gradient(145deg, ${customDashboardColor} 0%, color-mix(in srgb, ${customDashboardColor} 72%, #ffffff 28%) 100%)` : selectedDashboardTheme.background, "--menu-gradient": selectedMenuTheme.background, "--card-gradient-1": CARD_GRADIENTS[0], "--card-gradient-2": CARD_GRADIENTS[1], "--card-gradient-3": CARD_GRADIENTS[2], "--card-gradient-4": CARD_GRADIENTS[3] } as CSSProperties}>
      <SlideNotifications />

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

        style={{ ...styles.sidebar, background: selectedMenuTheme.background, "--menu-gradient": selectedMenuTheme.background } as CSSProperties}

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

          <NavButton icon="📚" label="All Customer Data" active={activePage === "all-customer-data"} onClick={() => openPage("all-customer-data")} />

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
            icon="⚡"
            label="Quick Passbook"
            active={activePage === "quick-passbook"}
            onClick={() => openPage("quick-passbook")}
          />

          <NavButton

            icon="🔎"

            label="Account Opening PDF Sample"

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

          {userRole === "admin" && <NavButton

            icon="⚙️"

            label="Settings"

            active={

              activePage === "settings"

            }

            onClick={() =>

              openPage("settings")

            }

          />}

          {(accountRole === "master_owner" || accountRole === "master_admin" || sessionStorage.getItem("bankSetuConnectionMode") === "option-b") && <NavButton icon="🔄" label="Sync & Backup" active={activePage === "sync-backup"} onClick={() => openPage("sync-backup")} />}
        </nav>

        <button type="button" className={activePage === "support" ? "banksetu-nav-item banksetu-support-button active" : "banksetu-nav-item banksetu-support-button"} onClick={() => openPage("support")}>
          <span>🎧</span><span>Support</span>{supportUnread > 0 && <b className="banksetu-support-badge">{supportUnread > 99 ? "99+" : supportUnread}</b>}
        </button>

      </aside>

      {/* MAIN AREA */}

      <section
        className="banksetu-main-workspace"
        style={{
          ...styles.mainContent,
          background: useCustomDashboardColor
            ? `linear-gradient(145deg, ${customDashboardColor} 0%, color-mix(in srgb, ${customDashboardColor} 72%, #000 28%) 100%)`
            : selectedDashboardTheme.background,
        }}
      >

        <header className="dashboard-top-bar" style={styles.topBar}>

          <button

            type="button"

            className="mobile-menu-button"

            style={{ ...styles.mobileMenuButton, background: selectedMenuTheme.background, border: "1px solid rgba(255,255,255,0.34)", color: "#fff" }}

            onClick={() =>

              setMobileMenuOpen(true)

            }

          >

            ☰

          </button>

          <section

            className="persistent-bank-header"

            style={styles.bankHeader}

          >

            <div

              className={`bank-logo-zone ${

                bankLogo ? "has-logo" : ""

              }`}

              tabIndex={bankLogo ? 0 : -1}

              style={styles.bankLogoZone}

            >

              {bankLogo ? (

                <>

                  <img

                    src={bankLogo}

                    alt="Bank Logo"

                    style={styles.bankLogoImage}

                  />

                  {userRole === "admin" && (
                    <button
                      type="button"
                      className="logo-edit-pencil"
                      style={styles.logoEditButton}
                      onClick={openLogoPicker}
                      title="Edit Bank Logo"
                    >
                      ✎
                    </button>
                  )}

                </>

              ) : (

                userRole === "admin" ? (
                  <button
                    type="button"
                    style={styles.firstLogoUpload}
                    onClick={openLogoPicker}
                  >
                    <span style={styles.uploadLogoIcon}>🏦</span>
                    <span>
                      <strong>Upload Bank Logo</strong>
                      <small style={styles.uploadHint}>Add your bank or CSP logo</small>
                    </span>
                  </button>
                ) : (
                  <div style={styles.firstLogoUpload}>
                    <span style={styles.uploadLogoIcon}>🏦</span>
                    <span><strong>Bank Logo</strong></span>
                  </div>
                )

              )}

              <input

                ref={logoInputRef}

                type="file"

                accept="image/*"

                onChange={handleLogoUpload}

                style={{ display: "none" }}

              />

            </div>

            <div

              className={`bank-info-strip ${

                hasBankInfo ? "has-info" : ""

              }`}

              tabIndex={hasBankInfo ? 0 : -1}

              style={styles.bankInfoStrip}

            >

              <h2 style={styles.bankInfoTitle}>

                {bankInfo.bankName || "Your Bank / CSP Name"}

              </h2>

              {hasBankInfo ? (

                <div style={styles.bankInfoDetails}>

                  {bankInfo.passbookBank && (

                    <span>Passbook Bank: {bankInfo.passbookBank}</span>

                  )}

                  {bankInfo.branchName && (

                    <span>Branch: {bankInfo.branchName}</span>

                  )}

                  {bankInfo.cspCode && (

                    <span>CSP Code: {bankInfo.cspCode}</span>

                  )}

                  {bankInfo.operatorName && (

                    <span>Operator: {bankInfo.operatorName}</span>

                  )}

                  {bankInfo.address && (

                    <span>Address: {bankInfo.address}</span>

                  )}

                </div>

              ) : (

                <p style={styles.bankInfoText}>

                  Branch name, CSP code,

                  operator name and address

                  can be displayed here.

                </p>

              )}

              {userRole === "admin" && (
                hasBankInfo ? (
                  <button
                    type="button"
                    className="bank-info-edit-pencil"
                    style={styles.bankInfoEditPencil}
                    onClick={openBankInfoEditor}
                    title="Edit Bank / CSP Information"
                    aria-label="Edit Bank / CSP Information"
                  >
                    ✎
                  </button>
                ) : (
                  <button
                    type="button"
                    style={styles.editInfoButton}
                    onClick={openBankInfoEditor}
                  >
                    ✎ Edit Information
                  </button>
                )
              )}

            </div>

          </section>

          <div className="admin-wrapper" style={styles.adminWrapper}>

            <button
              type="button"
              style={{ ...styles.dashboardSyncButton, opacity: syncStatus.syncing ? 0.65 : 1 }}
              onClick={syncDashboard}
              disabled={syncStatus.syncing}
              aria-busy={syncStatus.syncing}
              title={syncStatus.error || (!syncStatus.online ? "Offline — changes pending" : syncStatus.syncing ? "Syncing Google customer data…" : syncStatus.pending ? `${syncStatus.pending} changes pending` : "Sync customer data")}
              aria-label="Sync dashboard data"
            >
              <span className={syncStatus.syncing ? "banksetu-sync-spinning" : undefined}>{!syncStatus.online || syncStatus.error ? "!" : "↻"}</span>
            </button>


            <button

              type="button"

              className="admin-trigger"

              ref={adminTriggerRef}

              style={styles.adminBox}

              onClick={() => {
                if (!adminMenuOpen) {
                  const rect = adminTriggerRef.current?.getBoundingClientRect();
                  if (rect) setAdminMenuPosition({
                    top: rect.bottom + 8,
                    right: Math.max(8, window.innerWidth - rect.right),
                  });
                }
                setAdminMenuOpen(!adminMenuOpen);
              }}

            >

              <div style={styles.adminAvatar}>

                {userRole === "admin" ? "A" : "U"}

              </div>

              <span

                className="admin-label"

                style={styles.adminLabel}

              >

                {userRole === "admin" ? "Admin" : "User"}

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

            {adminMenuOpen && createPortal(

              <div style={{ ...styles.adminMenu, position: "fixed", top: adminMenuPosition.top, right: adminMenuPosition.right, maxHeight: `calc(100dvh - ${adminMenuPosition.top + 12}px)`, overflowY: "auto", zIndex: 2000 }}>

                <button

                  type="button"

                  style={styles.adminMenuItem}

                  onClick={openPasswordModal}

                >

                  🔐 Reset Password

                </button>


                {canControlGlobalDashboard && <button
                  type="button" style={styles.adminMenuItem}
                  onClick={() => { setAdminMenuOpen(false); setThemeModalOpen(true); }}
                >🎨 Dashboard Color</button>}

                {canControlGlobalDashboard && <button
                  type="button" style={styles.adminMenuItem}
                  onClick={() => { setAdminMenuOpen(false); setMenuThemeModalOpen(true); }}
                >🌈 Menu Color</button>}

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



                {userRole === "admin" && accountRole !== "client_admin" && (
                  <button type="button" style={styles.adminMenuItem} onClick={() => { setAdminMenuOpen(false); setClientCreateOpen(true); }}>
                    ＋ Create Client Admin
                  </button>
                )}

                {userRole === "admin" && (
                  <button
                    type="button"
                    style={styles.adminMenuItem}
                    onClick={() => {
                      setAdminMenuOpen(false);
                      setAdvancedAdminOpen(true);
                    }}
                  >
                    {accountRole === "client_admin" ? "⚙️ Workspace Settings" : "🛡️ Advanced Administrator Control"}
                  </button>
                )}

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

            , document.body)}

          </div>

        </header>

        <div className="dashboard-top-divider" style={styles.topDivider} />

        <ClientGoogleSetup enabled={accountRole === "client_admin"} />

        {/* PAGE CONTENT */}

        <div style={styles.pageContent}>
          <LocalSyncStatus visible={activePage === "sync-backup"} />
          {activePage === "support" && <SupportCenter accountRole={accountRole} />}
          {!bankSettingsReady && <p role="status" style={{color:"#414158",padding:16,background:"white",borderRadius:10}}>{bankSettingsError || "Loading saved bank settings from Firebase…"}{bankSettingsError && <button type="button" onClick={()=>setBankSettingsRetry(n=>n+1)} style={{marginLeft:12}}>Retry</button>}</p>}

          {activePage === "dashboard" && (

            <DashboardHome

              openPage={openPage}
              bankSettingsReady={bankSettingsReady}
              accountRole={accountRole}

            />

          )}

          {activePage ===

            "customer-entry" && (

            bankSettingsReady ? <CustomerEntry bankName={bankInfo.passbookBank} /> : null

          )}

          {activePage === "settings" && userRole === "admin" && (

            <Settings userRole={userRole} />

          )}

          {activePage === "customers" && (

            <Customers />

          )}

          {activePage === "all-customer-data" && <AllCustomerData />}

          {bankSettingsReady && activePage === "passbook" && (

            <SelectedBankDocument formatType="passbook" bankInfo={bankInfo} />

          )}

          {bankSettingsReady && activePage === "quick-passbook" && (
            <SelectedBankDocument formatType="quickPassbook" bankInfo={bankInfo} />
          )}

          {bankSettingsReady && activePage === "bank-formats" && accountRole === "client_admin" && (
            <BankFormats enabled canManage bankName={bankInfo.passbookBank} />
          )}

          {bankSettingsReady && activePage === "search" && <SelectedBankDocument formatType="accountOpening" bankInfo={bankInfo} />}

          {activePage === "reports" && (

            <Reports />

          )}

        </div>

      </section>

      {bankInfoEditOpen && (

        <div

          style={styles.modalOverlay}

          onMouseDown={(event) => {

            if (event.target === event.currentTarget) {

              setBankInfoEditOpen(false);

            }

          }}

        >

          <div style={styles.bankInfoModal}>

            <div style={styles.modalHeader}>

              <div>

                <p style={styles.bankInfoLabel}>

                  BANK INFORMATION

                </p>

                <h2 style={styles.modalTitle}>

                  {hasBankInfo

                    ? "Edit CSP Information"

                    : "Add CSP Information"}

                </h2>

              </div>

              <button

                type="button"

                style={styles.modalClose}

                onClick={() =>

                  setBankInfoEditOpen(false)

                }

              >

                ×

              </button>

            </div>

            <div

              className="bank-info-form-grid"

              style={styles.bankInfoFormGrid}

            >

              <label style={styles.bankInfoFieldFull}>

                <span style={styles.bankInfoFieldLabel}>

                  Bank / CSP Name *

                </span>

                <input

                  value={bankInfoDraft.bankName}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "bankName",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoInput}

                  placeholder="Enter Bank / CSP Name"

                  autoFocus

                />

              </label>

              <label style={styles.bankInfoFieldFull}>

                <span style={styles.bankInfoFieldLabel}>

                  Bank for Passbook Printing *

                </span>

                <select

                  value={bankInfoDraft.passbookBank}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "passbookBank",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoInput}

                >

                  <option value="">Select Bank</option>

                  {PASSBOOK_BANK_OPTIONS.map((bank) => (

                    <option key={bank} value={bank}>

                      {bank}

                    </option>

                  ))}

                </select>

              </label>

              <label style={styles.bankInfoField}>

                <span style={styles.bankInfoFieldLabel}>

                  Branch Name

                </span>

                <input

                  value={bankInfoDraft.branchName}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "branchName",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoInput}

                  placeholder="Enter Branch Name"

                />

              </label>

              <label style={styles.bankInfoField}>

                <span style={styles.bankInfoFieldLabel}>

                  CSP Code

                </span>

                <input

                  value={bankInfoDraft.cspCode}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "cspCode",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoInput}

                  placeholder="Enter CSP Code"

                />

              </label>

              <label style={styles.bankInfoFieldFull}>

                <span style={styles.bankInfoFieldLabel}>

                  Operator Name

                </span>

                <input

                  value={bankInfoDraft.operatorName}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "operatorName",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoInput}

                  placeholder="Enter Operator Name"

                />

              </label>

              <label style={styles.bankInfoFieldFull}>

                <span style={styles.bankInfoFieldLabel}>

                  Address

                </span>

                <textarea

                  value={bankInfoDraft.address}

                  onChange={(event) =>

                    updateBankInfoDraft(

                      "address",

                      event.target.value

                    )

                  }

                  style={styles.bankInfoTextarea}

                  placeholder="Enter CSP Address"

                  rows={3}

                />

              </label>

            </div>

            <div style={styles.bankInfoModalActions}>

              <button

                type="button"

                style={styles.bankInfoCancelButton}

                onClick={() =>

                  setBankInfoEditOpen(false)

                }

              >

                Cancel

              </button>

              <button

                type="button"

                style={styles.bankInfoSaveButton}

                onClick={saveBankInfo}

              >

                Save Information

              </button>

            </div>

          </div>

        </div>

      )}

      {/* DASHBOARD COLOR */}

      {themeModalOpen && canControlGlobalDashboard && (

        <div

          style={styles.modalOverlay}

          onMouseDown={(event) => {

            if (event.target === event.currentTarget) {

              setThemeModalOpen(false);

            }

          }}

        >

          <div style={styles.themeModal}>

            <div style={styles.modalHeader}>

              <div>

                <p style={styles.passwordEyebrow}>

                  APPEARANCE

                </p>

                <h2 style={styles.modalTitle}>

                  Dashboard Color

                </h2>

                <p style={styles.passwordHelpText}>

                  Choose the workspace background. Cards stay dark for clear contrast.

                </p>

              </div>

              <button

                type="button"

                style={styles.modalClose}

                onClick={() => setThemeModalOpen(false)}

                aria-label="Close dashboard color dialog"

              >

                ×

              </button>

            </div>

            <div style={styles.themeGrid}>

              {DASHBOARD_THEMES.map((theme) => (

                <button

                  key={theme.id}

                  type="button"

                  style={{

                    ...styles.themeChoice,

                    ...(dashboardTheme === theme.id

                      ? styles.themeChoiceActive

                      : {}),

                  }}

                  onClick={() => void changeDashboardTheme(theme.id)}

                >

                  <span

                    style={{

                      ...styles.themeSwatch,

                      background: theme.preview,

                    }}

                  />

                  <span>{theme.name}</span>

                  {dashboardTheme === theme.id && (

                    <strong style={styles.themeSelected}>✓</strong>

                  )}

                </button>

              ))}

            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <p style={{ ...styles.passwordHelpText, marginBottom: 10 }}>Custom dynamic color</p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="color"
                  value={customDashboardColor}
                  onChange={(event) => setCustomDashboardColor(event.target.value)}
                  aria-label="Choose custom dashboard color"
                  style={{ width: 56, height: 42, border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
                />
                <input
                  value={customDashboardColor}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomDashboardColor(value.startsWith("#") ? value : `#${value}`);
                  }}
                  placeholder="#123B4A"
                  style={{ flex: "1 1 130px", minWidth: 130, height: 40, borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "#0b2531", color: "#fff", padding: "0 12px" }}
                />
                <button
                  type="button"
                  style={styles.themeChoice}
                  onClick={() => {
                    localStorage.setItem(tenantStorageKey("bankSetuCustomDashboardColor"), customDashboardColor);
                    localStorage.setItem(tenantStorageKey("bankSetuUseCustomDashboardColor"), "true");
                    setUseCustomDashboardColor(true);
                    void saveGlobalUiTheme({ customDashboardColor, useCustomDashboardColor: true });
                    setThemeModalOpen(false);
                  }}
                >Apply RGB / Custom</button>
                {useCustomDashboardColor && <button type="button" style={styles.themeChoice} onClick={() => {
                  localStorage.setItem(tenantStorageKey("bankSetuUseCustomDashboardColor"), "false");
                  setUseCustomDashboardColor(false);
                  void saveGlobalUiTheme({ dashboardTheme, useCustomDashboardColor: false });
                }}>Use Preset</button>}
              </div>
            </div>

          </div>

        </div>

      )}

      {menuThemeModalOpen && canControlGlobalDashboard && (
        <div style={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuThemeModalOpen(false); }}>
          <div style={{ ...styles.themeModal, width: "min(430px, 92vw)", maxHeight: "72vh", padding: "18px", display: "flex", flexDirection: "column" }}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.passwordEyebrow}>APPEARANCE</p>
                <h2 style={styles.modalTitle}>Menu Color</h2>
                <p style={styles.passwordHelpText}>Choose a vibrant gradient for the sidebar menu. Text stays high-contrast automatically.</p>
              </div>
              <button type="button" style={styles.modalClose} onClick={() => setMenuThemeModalOpen(false)} aria-label="Close menu color dialog">×</button>
            </div>
            <div style={{ ...styles.themeGrid, overflowY: "auto", paddingRight: "6px", marginTop: "12px", gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              {MENU_THEMES.map((theme) => (
                <button key={theme.id} type="button" style={{ ...styles.themeChoice, ...(menuTheme === theme.id ? styles.themeChoiceActive : {}) }} onClick={() => void changeMenuTheme(theme.id)}>
                  <span style={{ ...styles.themeSwatch, background: theme.preview }} />
                  <span>{theme.name}</span>
                  {menuTheme === theme.id && <strong style={styles.themeSelected}>✓</strong>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {clientCreateOpen && userRole === "admin" && accountRole !== "client_admin" && (
        <div style={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setClientCreateOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Create Client Admin" style={{ ...styles.themeModal, width: "min(760px, 94vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Client Admin</h2>
              <button type="button" aria-label="Close create client" style={styles.modalClose} onClick={() => setClientCreateOpen(false)}>×</button>
            </div>
            <MasterClients enabled />
          </div>
        </div>
      )}

      {advancedAdminOpen && userRole === "admin" && (
        <div style={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setAdvancedAdminOpen(false); }}>
          <div style={{ ...styles.themeModal, width: "min(1100px, 94vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={styles.modalHeader}>
              <div><p style={styles.passwordEyebrow}>ADMIN ONLY</p><h2 style={styles.modalTitle}>{accountRole === "client_admin" ? "Workspace Settings" : "Advanced Administrator Control"}</h2></div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {accountRole === "client_admin" && <button type="button" style={{padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.35)",background:"#153b47",color:"#fff"}} onClick={() => { setAdvancedAdminOpen(false); openPage("bank-formats"); }}>🏦 Bank Formats</button>}
                <button type="button" style={styles.modalClose} onClick={() => setAdvancedAdminOpen(false)}>×</button>
              </div>
            </div>
            <AdvancedAdmin
              allowConnectionSettings={accountRole === "master_owner" || accountRole === "admin"}
              isMasterOwner={accountRole === "master_owner" || (
                accountRole === "admin" &&
                getAuth().currentUser?.email?.trim().toLowerCase() === "banksetu2026@gmail.com" &&
                getAuth().currentUser?.emailVerified === true
              )}
              isClientAdmin={accountRole === "client_admin"}
            />
          </div>
        </div>
      )}

      {/* ADMIN PASSWORD */}

      {passwordModalOpen && (

        <div

          style={styles.modalOverlay}

          onMouseDown={(event) => {

            if (

              event.target === event.currentTarget &&

              !passwordLoading

            ) {

              closePasswordModal();

            }

          }}

        >

          <div style={styles.passwordModal}>

            <div style={styles.modalHeader}>

              <div>

                <p style={styles.passwordEyebrow}>

                  ADMIN SECURITY

                </p>

                <h2 style={styles.modalTitle}>

                  Change Admin Password

                </h2>

                <p style={styles.passwordHelpText}>

                  Verify your current password, then set a new password.

                </p>

              </div>

              <button

                type="button"

                style={styles.modalClose}

                onClick={closePasswordModal}

                disabled={passwordLoading}

                aria-label="Close password dialog"

              >

                ×

              </button>

            </div>

            <div style={styles.passwordForm}>

              <label style={styles.passwordField}>

                <span style={styles.bankInfoFieldLabel}>

                  Current Password

                </span>

                <input

                  type="password"

                  value={currentPassword}

                  onChange={(event) =>

                    setCurrentPassword(event.target.value)

                  }

                  style={styles.passwordInput}

                  placeholder="Enter current password"

                  autoComplete="current-password"

                  autoFocus

                />

              </label>

              <label style={styles.passwordField}>

                <span style={styles.bankInfoFieldLabel}>

                  New Password

                </span>

                <input

                  type="password"

                  value={newPassword}

                  onChange={(event) =>

                    setNewPassword(event.target.value)

                  }

                  style={styles.passwordInput}

                  placeholder="Minimum 6 characters"

                  autoComplete="new-password"

                />

              </label>

              <label style={styles.passwordField}>

                <span style={styles.bankInfoFieldLabel}>

                  Confirm New Password

                </span>

                <input

                  type="password"

                  value={confirmPassword}

                  onChange={(event) =>

                    setConfirmPassword(event.target.value)

                  }

                  onKeyDown={(event) => {

                    if (event.key === "Enter") {

                      void changeAdminPassword();

                    }

                  }}

                  style={styles.passwordInput}

                  placeholder="Re-enter new password"

                  autoComplete="new-password"

                />

              </label>

              {passwordError && (

                <div style={styles.passwordError}>

                  {passwordError}

                </div>

              )}

            </div>

            <div style={styles.passwordActions}>

              <button

                type="button"

                style={styles.passwordCancelButton}

                onClick={closePasswordModal}

                disabled={passwordLoading}

              >

                Cancel

              </button>

              <button

                type="button"

                style={styles.passwordSaveButton}

                onClick={() => void changeAdminPassword()}

                disabled={passwordLoading}

              >

                {passwordLoading

                  ? "Changing..."

                  : "Change Password"}

              </button>

            </div>

          </div>

        </div>

      )}

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

            .logo-edit-pencil,

            .bank-logo-zone.has-logo:hover

            .logo-edit-pencil {

              opacity: 0;

              pointer-events: none;

              transform: scale(0.9);

            }

            .bank-logo-zone:focus,

            .bank-info-strip:focus {

              outline: none;

            }

            .bank-logo-zone.has-logo:focus-within

            .logo-edit-pencil {

              opacity: 1;

              pointer-events: auto;

              transform: scale(1);

            }

          }

          .bank-info-edit-pencil {

            opacity: 0;

            transform: scale(0.9);

            transition:

              opacity 0.18s ease,

              transform 0.18s ease;

          }

          .bank-info-strip.has-info:hover

          .bank-info-edit-pencil {

            opacity: 1;

            transform: scale(1);

          }

          @media (hover: none) {

            .bank-info-strip.has-info

            .bank-info-edit-pencil,

            .bank-info-strip.has-info:hover

            .bank-info-edit-pencil {

              opacity: 0;

              pointer-events: none;

              transform: scale(0.9);

            }

            .bank-info-strip.has-info:focus-within

            .bank-info-edit-pencil {

              opacity: 1;

              pointer-events: auto;

              transform: scale(1);

            }

          }

          .dashboard-count-transition { display:inline-block; animation:banksetu-count-enter .2s ease-out; }
          @keyframes banksetu-count-enter { from { opacity:.5; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
          @media (prefers-reduced-motion:reduce) { .dashboard-count-transition { animation:none; } }

          @media (max-width: 620px) {

            .bank-info-form-grid {

              grid-template-columns: 1fr !important;

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

            .dashboard-top-bar {

              display: grid !important;

              grid-template-columns: 42px minmax(0, 1fr) max-content !important;

              align-items: start !important;

              gap: 10px !important;

              min-height: auto !important;

              padding: 8px !important;

              border-radius: 15px !important;

            }

            .dashboard-top-divider {

              margin: 10px 0 16px !important;

            }

            .mobile-menu-button {

              grid-column: 1 !important;

              grid-row: 1 !important;

            }

            .persistent-bank-header {

              grid-column: 2 !important;

              grid-row: 1 !important;

              width: 100% !important;

              gap: 5px !important;

              justify-items: center !important;

            }

            .admin-wrapper {

              grid-column: 3 !important;

              grid-row: 1 !important;

              justify-self: end !important;

              gap: 4px !important;

              padding-left: 0 !important;

              border-left: none !important;

            }

            .bank-logo-zone {

              width: 100% !important;

              min-height: 46px !important;

              justify-content: center !important;

            }

            .bank-logo-zone img {

              max-width: 190px !important;

              height: 46px !important;

              object-position: center center !important;

            }

            .bank-info-strip {

              width: 100% !important;

              min-height: 0 !important;

              padding: 0 18px !important;

              align-items: center !important;

              text-align: center !important;

            }

            .bank-info-strip p,

            .bank-info-strip h2 {

              text-align: center !important;

            }

            .bank-info-strip h2 {

              margin: 2px 0 !important;

              font-size: 11px !important;

              line-height: 1.2 !important;

            }

            .bank-info-strip > p:first-child {

              font-size: 6px !important;

              letter-spacing: 1px !important;

            }

            .bank-info-strip > div {

              justify-content: center !important;

              text-align: center !important;

              gap: 2px 7px !important;

              font-size: 6.5px !important;

              line-height: 1.3 !important;

            }

            .bank-info-edit-pencil {

              left: auto !important;

              right: -4px !important;

              width: 24px !important;

              height: 24px !important;

              font-size: 12px !important;

            }

            .dashboard-stats-grid {

              grid-template-columns:

                repeat(2, minmax(0, 1fr)) !important;

              gap: 8px !important;

              margin-bottom: 14px !important;

            }

            .dashboard-stat-card {

              min-width: 0 !important;

              padding: 11px !important;

              border-radius: 13px !important;

            }

            .dashboard-stat-top {

              margin-bottom: 9px !important;

            }

            .dashboard-stat-icon {

              width: 31px !important;

              height: 31px !important;

              border-radius: 9px !important;

              font-size: 14px !important;

            }

            .dashboard-stat-badge {

              font-size: 6px !important;

            }

            .dashboard-stat-value {

              font-size: 21px !important;

              line-height: 1.05 !important;

            }

            .dashboard-stat-title {

              margin-top: 4px !important;

              font-size: 9px !important;

              line-height: 1.2 !important;

            }

            .dashboard-quick-grid {

              grid-template-columns:

                1fr !important;

            }

            .dashboard-sync-banner {

              margin-bottom: 10px !important;

            }

          }

        `}

      </style>

    </main>

  );

}

/* =========================

   DASHBOARD HOME

\========================= */

type StatusPanelType = "kyc" | "passbook" | "inactive";
type StatusCustomer = Record<string, unknown> & {rowNumber?: number; recordId?: string};
const statusPanelConfig = {
  kyc: {title:"KYC Pending Customers", field:"status", current:"Pending", next:"Active"},
  passbook: {title:"Passbook Pending Customers", field:"passbookStatus", current:"Pending", next:"Printed"},
  inactive: {title:"Inactive Account Customers", field:"status", current:"Inactive", next:"Active"},
} as const;

function DashboardStatusPanel({type, accountRole, onClose}: {type:StatusPanelType;accountRole:string;onClose:()=>void}) {
  const config=statusPanelConfig[type];
  const [customers,setCustomers]=useState<StatusCustomer[]>([]);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const canUpdate=["admin","master_owner","client_admin","client_user","user"].includes(accountRole);
  const refresh=async()=>{
    if(localModeEnabled())return await getActiveLocalCustomers() as StatusCustomer[];
    const apiUrl=getTenantApiUrl();
    if(!apiUrl)throw new Error("Customer workspace is unavailable.");
    const all:StatusCustomer[]=[];
    for(let page=1;page<=100;page++){
      const response=await localDataFetch(apiUrl,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"getAllCustomers",page,pageSize:250,idToken:await getDataIdToken()})});
      if(!response.ok)throw new Error("Customer list could not be loaded.");
      const result=await response.json() as {success?:boolean;message?:string;customers?:StatusCustomer[];hasNextPage?:boolean};
      if(!result.success||!Array.isArray(result.customers))throw new Error(result.message||"Customer list could not be loaded.");
      all.push(...result.customers);
      if(!result.hasNextPage)return all;
    }
    throw new Error("Customer list is too large to load in this popup.");
  };
  useEffect(()=>{
    let active=true;
    const load=()=>{void refresh().then(rows=>{if(active){setCustomers(rows);setError("");setLoading(false);}}).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:"Customer list unavailable.");setLoading(false);}});};
    load();
    const onSync=()=>{if(localModeEnabled())load();};
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("banksetu-sync-change",onSync);
    window.addEventListener("keydown",onKey);
    return()=>{active=false;window.removeEventListener("banksetu-sync-change",onSync);window.removeEventListener("keydown",onKey);};
    // The active workspace already scopes the repository and Google bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type]);
  const matched=customers.filter(customer=>{
    const status=String(customer[config.field]??"").trim().toLowerCase();
    return type==="passbook" ? !status||status==="pending" : status===config.current.toLowerCase();
  });
  const visible=matched.filter(customer=>[customer.name,customer.accountNo,customer.enrolId].some(value=>String(value??"").toLowerCase().includes(query.trim().toLowerCase())));
  const update=async(customer:StatusCustomer,next:string)=>{
    if(next===String(customer[config.field]||config.current))return;
    const id=String(customer.recordId||customer.rowNumber||customer.accountNo);
    setBusy(id);setError("");setNotice("");
    try{
      const apiUrl=getTenantApiUrl();if(!apiUrl)throw new Error("Customer workspace is unavailable.");
      const response=await localDataFetch(apiUrl,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"updateCustomer",rowNumber:customer.rowNumber,statusOnly:true,statusField:config.field,statusValue:next,customer:{},idToken:await getDataIdToken()})});
      if(!response.ok)throw new Error("Customer status could not be saved.");
      const result=await response.json() as {success?:boolean;message?:string;queued?:boolean};
      if(!result.success)throw new Error(result.message||"Customer status could not be saved.");
      setCustomers(previous=>previous.map(item=>String(item.recordId||item.rowNumber||item.accountNo)===id?{...item,[config.field]:next}:item));
      setNotice(result.queued?"Saved locally; Google sync pending.":"Customer status saved.");
      if(!result.queued)window.dispatchEvent(new Event("banksetu-sync-change"));
    }catch(cause){setError(cause instanceof Error?cause.message:"Customer status update failed.");}
    finally{setBusy("");}
  };
  const copy=async(account:string)=>{
    try{
      const desktop=(window as Window & {bankSetuDesktop?:{copyText?:(value:string)=>Promise<void>}}).bankSetuDesktop;
      if(desktop?.copyText)await desktop.copyText(account);
      else await navigator.clipboard.writeText(account);
      setNotice("Account number copied.");
    }catch{setError("Clipboard unavailable on this device.");}
  };
  return createPortal(<div className="dashboard-status-overlay" onClick={onClose}>
    <section className="dashboard-status-panel" role="dialog" aria-modal="true" aria-label={config.title} onClick={event=>event.stopPropagation()}>
      <header><div><h2>{config.title}</h2><p>Total {config.current}: {matched.length}</p></div><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <input type="search" aria-label="Search customers" placeholder="Search customer or account number…" value={query} onChange={event=>setQuery(event.target.value)} />
      {error&&<p role="alert" className="dashboard-status-error">{error}</p>}
      {notice&&<p role="status" className="dashboard-status-notice">{notice}</p>}
      {loading?<p role="status">Loading customers…</p>:<div className="dashboard-status-list">
        {visible.map(customer=>{const id=String(customer.recordId||customer.rowNumber||customer.accountNo);const account=String(customer.accountNo??"");return <div className="dashboard-status-row" key={id}>
          <strong>{String(customer.name??"")}</strong>
          <span className="dashboard-status-account">{account}<button type="button" aria-label={`Copy account number ${account}`} onClick={()=>void copy(account)}>⧉</button></span>
          <select aria-label={`${config.title} status for ${String(customer.name??"")}`} value={String(customer[config.field]||config.current)} disabled={!canUpdate||busy===id} onChange={event=>void update(customer,event.target.value)}>
            {[...new Set([String(customer[config.field]||config.current),config.next])].map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </div>;})}
        {!visible.length&&<p>No matching customers.</p>}
      </div>}
      <footer><span>Showing {visible.length} of {matched.length} customers</span><button type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>,document.body);
}

function DashboardHome({

  openPage,
  bankSettingsReady,
  accountRole,

}: {

  openPage: (page: PageName) => void;
  bankSettingsReady: boolean;
  accountRole: string;

}) {

  type DashboardStats = {

    totalCustomers: number;

    kycPending: number;

    passbookPending: number;

    inactiveAccounts: number;

  };

  const [dashboardStats, setDashboardStats] =

    useState<DashboardStats>({

      totalCustomers: 0,

      kycPending: 0,

      passbookPending: 0,

      inactiveAccounts: 0,

    });

  const [statsLoading, setStatsLoading] =

    useState(true);

  const [statsError, setStatsError] =

    useState("");
  const statsLoadedOnce = useRef(false);

  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [statusPanel, setStatusPanel] = useState<"kyc" | "passbook" | "inactive" | null>(null);

  useEffect(() => {
    const refreshDashboardAfterWorkspaceReady = () => {
      setWorkspaceVersion((version) => version + 1);
    };
    window.addEventListener("banksetu-workspace-change", refreshDashboardAfterWorkspaceReady);
    window.addEventListener("banksetu-sync-change", refreshDashboardAfterWorkspaceReady);
    return () => {window.removeEventListener("banksetu-workspace-change", refreshDashboardAfterWorkspaceReady);window.removeEventListener("banksetu-sync-change", refreshDashboardAfterWorkspaceReady);};
  }, []);

  useEffect(() => {

    // Workspace/API hydration completes after the dashboard mounts on a fresh
    // session. Do not report a false sync error while that configuration is
    // still being restored from Firebase/local session state.
    if (!bankSettingsReady) {
      if(!statsLoadedOnce.current)setStatsLoading(true);
      return;
    }

    let cancelled = false;

    const loadDashboardStats = async () => {

      if(!statsLoadedOnce.current)setStatsLoading(true);

      setStatsError("");

      try {

        // The customer list and dashboard use the same scoped local records;
        // the existing sync engine refreshes them from Google in the background.
        if (localModeEnabled()) {
            const records = await getActiveLocalCustomers();
              const text = (value: unknown) => String(value ?? "").trim().toLowerCase();
              const field = (customer: Record<string, unknown>, names: string[]) => {
                const key = Object.keys(customer).find((candidate) => names.includes(candidate.toLowerCase().replace(/[ _-]/g, "")));
                return key ? customer[key] : "";
              };
              const localStats = {
                totalCustomers: records.length,
                kycPending: records.filter((customer) => text(field(customer, ["status"])) === "pending").length,
                passbookPending: records.filter((customer) => ["", "pending"].includes(text(field(customer, ["passbookstatus"])))).length,
                inactiveAccounts: records.filter((customer) => text(field(customer, ["status"])) === "inactive").length,
              };
              if (!cancelled) {
                setDashboardStats(localStats);
                statsLoadedOnce.current=true;
                setStatsLoading(false);
                setStatsError("");
              }
            return;
        }

        const apiUrl = getTenantApiUrl();

        if (!apiUrl) {

          throw new Error(

            "Google Sheet API URL is not configured."

          );

        }

        const auth = getAuth();

        const user = auth.currentUser;

        if (!user) {

          throw new Error(

            "Firebase login session is not available. Please login again."

          );

        }

        let result: {

          success?: boolean;

          message?: string;

          stats?: Partial<DashboardStats>;

        } | null = null;

        let lastError: Error | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {

          try {

            const idToken = await getDataIdToken(attempt > 0);

            const response = await localDataFetch(apiUrl, {

              method: "POST",

              headers: {

                "Content-Type":

                  "text/plain;charset=utf-8",

              },

              body: JSON.stringify({

                action: "getDashboardStats",

                idToken,

              }),

            });

            const rawText = await response.text();

            if (!response.ok) {

              throw new Error(

                `Dashboard service returned HTTP ${response.status}.`

              );

            }

            const trimmed = rawText.trim();

            if (

              !trimmed ||

              trimmed.startsWith("<") ||

              trimmed.toLowerCase().startsWith("<!doctype")

            ) {

              throw new Error(

                "Dashboard service returned a temporary web page instead of data."

              );

            }

            try {

              result = JSON.parse(trimmed) as {

                success?: boolean;

                message?: string;

                stats?: Partial<DashboardStats>;

              };

            } catch {

              throw new Error(

                "Dashboard service returned an invalid data response."

              );

            }

            if (!result?.success) {

              throw new Error(

                result?.message ||

                  "Dashboard statistics could not be loaded."

              );

            }

            lastError = null;

            break;

          } catch (requestError) {

            lastError =

              requestError instanceof Error

                ? requestError

                : new Error(

                    "Dashboard statistics could not be loaded."

                  );

            if (attempt < 2) {

              await new Promise((resolve) =>

                window.setTimeout(

                  resolve,

                  attempt === 0 ? 700 : 1400

                )

              );

            }

          }

        }

        if (lastError || !result?.success) {

          throw (

            lastError ||

            new Error(

              "Dashboard statistics could not be loaded."

            )

          );

        }

        // Legacy cloud-only workspaces must count the same filtered rows that
        // All Customer Data displays; the aggregate endpoint can include
        // tombstoned Sheet rows.
        const customerIds = new Map<string,Record<string,unknown>>();
        for (let page = 1; page <= 100; page++) {
          const idToken = await getDataIdToken();
          const response = await localDataFetch(apiUrl, {
            method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
            body: JSON.stringify({action: "getAllCustomers", page, pageSize: 250, idToken}),
          });
          if (!response.ok) throw new Error("Customer count could not be loaded.");
          const listing = await response.json() as {success?: boolean; message?: string; customers?: Array<Record<string, unknown>>; hasNextPage?: boolean};
          if (!listing.success || !Array.isArray(listing.customers)) throw new Error(listing.message || "Customer count could not be loaded.");
          for (const customer of listing.customers) {
            const key = String(customer.recordId || customer.rowNumber || customer.accountNo || "").trim();
            if (key) customerIds.set(key,customer);
          }
          if (!listing.hasNextPage) break;
          if (page === 100) throw new Error("Customer count exceeds the available page limit.");
        }

        if (!cancelled) {
          const active=[...customerIds.values()];
          const status=(customer:Record<string,unknown>,field:string)=>String(customer[field]??"").trim().toLowerCase();

          setDashboardStats({

            totalCustomers: customerIds.size,
            kycPending:active.filter(customer=>status(customer,"status")==="pending").length,
            passbookPending:active.filter(customer=>["","pending"].includes(status(customer,"passbookStatus"))).length,
            inactiveAccounts:active.filter(customer=>status(customer,"status")==="inactive").length,

          });
          statsLoadedOnce.current=true;

        }

      } catch (error) {

        console.error(

          "Dashboard stats load failed:",

          error

        );

        if (!cancelled) {

          setStatsError(

            error instanceof Error

              ? error.message

              : "Dashboard statistics could not be loaded."

          );

        }

      } finally {

        if (!cancelled) {

          setStatsLoading(false);

        }

      }

    };

    void loadDashboardStats();

    return () => {

      cancelled = true;

    };

  }, [bankSettingsReady, workspaceVersion]);

  const stats = [

    [

      "👥",

      "Total Customers",

      dashboardStats.totalCustomers,

    ],

    [

      "🪪",

      "KYC Pending",

      dashboardStats.kycPending,

    ],

    [

      "📘",

      "Passbook Pending",

      dashboardStats.passbookPending,

    ],

    [

      "⏸",

      "Inactive Accounts",

      dashboardStats.inactiveAccounts,

    ],

  ] as const;

  return (

    <>

      {statsError && (

        <div

          className="dashboard-sync-banner"

          style={styles.syncErrorBanner}

          role="status"

        >

          <span style={styles.syncErrorIcon}>⚠</span>

          <div>

            <strong style={styles.syncErrorTitle}>Dashboard sync issue</strong>

            <span style={styles.syncErrorText}>{statsError}</span>

          </div>

        </div>

      )}

      <section className="dashboard-stats-grid" style={styles.statsGrid}>

        {stats.map(([icon, title, value], index) => (

          <button type="button"

            key={title}

            className="dashboard-stat-card"
            aria-label={`Open ${title}`}
            onClick={() => index === 0 ? openPage("all-customer-data") : setStatusPanel(index === 1 ? "kyc" : index === 2 ? "passbook" : "inactive")}

          style={{ ...styles.statCard, background: CARD_GRADIENTS[index % CARD_GRADIENTS.length] }}

          >

            <div className="dashboard-stat-top" style={styles.statTop}>

              <div className="dashboard-stat-icon" style={styles.statIcon}>

                {icon}

              </div>

              <span className="dashboard-stat-badge" style={styles.statBadge}>

                {statsLoading ? "SYNC" : "LIVE"}

              </span>

            </div>

            <div className="dashboard-stat-value" style={styles.statValue}>

              {statsLoading ? "…" : <span key={`${title}:${value}`} className="dashboard-count-transition">{value}</span>}

            </div>

            <h3 className="dashboard-stat-title" style={styles.statTitle}>

              {title}

            </h3>

          </button>

        ))}

      </section>
      {statusPanel && <DashboardStatusPanel type={statusPanel} accountRole={accountRole} onClose={() => setStatusPanel(null)} />}

      <section className="dashboard-quick-panel" style={styles.panel}>

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
            gradient={CARD_GRADIENTS[0]}

            text="Create a new customer record"

            onClick={() =>

              openPage("customer-entry")

            }

          />

          <QuickAction

            icon="📄"

            title="Upload PDF"
            gradient={CARD_GRADIENTS[1]}

            text="Import account opening PDF"

            onClick={() =>

              openPage("customer-entry")

            }

          />

          <QuickAction

            icon="🖨"

            title="Passbook Print"
            gradient={CARD_GRADIENTS[2]}

            text="Search and print passbook"

            onClick={() =>

              openPage("passbook")

            }

          />

          <QuickAction

            icon="🔎"

            title="Account Opening PDF"
            gradient={CARD_GRADIENTS[3]}

            text="Generate account opening PDF"

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

  gradient,

  onClick,

}: {

  icon: string;

  title: string;

  text: string;

  gradient: string;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      className="dashboard-quick-card"

      style={{ ...styles.quickCard, background: gradient }}

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

\========================= */

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

      className={active ? "banksetu-nav-item active" : "banksetu-nav-item"}

      onClick={onClick}

      style={

        active

          ? styles.navActive

          : styles.navButton

      }

    >

      <span>{icon}</span>

      <span>{label}</span>

    </button>

  );

}

/* =========================

   COMING SOON

\========================= */

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

\========================= */

const styles: Record<


  string,

  CSSProperties

> = {
  dashboardSyncButton: {
    width: "38px",
    height: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "12px",
    border: "1px solid rgba(71,226,200,0.24)",
    background: "rgba(50,218,192,0.08)",
    color: "#4ce0c6",
    cursor: "pointer",
    fontSize: "22px",
    lineHeight: 1,
  },

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

      "1px solid rgba(255,255,255,0.18)",
    boxShadow: "14px 0 38px rgba(15,23,42,0.18)",

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

      `url(${bankSetuLogo})`,

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

    color: "rgba(255,255,255,0.86)",

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

    color: "#ffffff",

    cursor: "pointer",

    textAlign: "left",

  },

  mainContent: {

    flex: 1,

    minWidth: 0,

    minHeight: "100vh",

    padding: "8px 32px 45px",

    boxSizing: "border-box",

    transition: "background 0.25s ease",

  },

  topBar: {

    display: "flex",

    alignItems: "center",

    gap: "18px",

    minHeight: "84px",

    padding: "10px 14px",

    boxSizing: "border-box",

    borderRadius: "18px",

    border: "1px solid rgba(255,255,255,0.07)",

    background:

      "linear-gradient(135deg,rgba(9,35,47,0.96),rgba(8,42,53,0.9))",

    boxShadow: "0 12px 34px rgba(0,0,0,0.18)",

  },

  topDivider: {

    width: "100%",

    height: "1px",

    margin: "14px 0 20px",

    background:

      "linear-gradient(90deg,transparent,rgba(71,226,200,0.28),rgba(255,255,255,0.08),transparent)",

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

    display: "flex",

    alignItems: "center",

    gap: "8px",

    whiteSpace: "nowrap",

    flexShrink: 0,

    paddingLeft: "16px",

    borderLeft: "1px solid rgba(255,255,255,0.07)",

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

    flex: 1,

    minWidth: 0,

    display: "grid",

    gridTemplateColumns:

      "minmax(210px, 1fr) minmax(360px, 620px)",

    alignItems: "center",

    justifyContent: "space-between",

    gap: "18px",

    margin: 0,

    padding: "0 4px",

  },

  bankLogoZone: {

    minHeight: "64px",

    position: "relative",

    display: "flex",

    alignItems: "center",

    justifyContent: "flex-start",

    overflow: "visible",

    padding: 0,

    boxSizing: "border-box",

    borderRadius: 0,

    border: "none",

    background: "transparent",

    boxShadow: "none",

  },

  bankLogoImage: {

    width: "100%",

    maxWidth: "320px",

    height: "62px",

    objectFit: "contain",

    objectPosition: "left center",

    display: "block",

    background: "transparent",

    border: "none",

    boxShadow: "none",

  },

  firstLogoUpload: {

    width: "100%",

    minHeight: "54px",

    display: "flex",

    alignItems: "center",

    justifyContent: "flex-start",

    gap: "10px",

    border: "1px dashed rgba(62,220,194,0.22)",

    borderRadius: "10px",

    background: "transparent",

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

    right: "2px",

    top: "2px",

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

    minHeight: "64px",

    position: "relative",

    width: "100%",

    justifySelf: "end",

    padding: "2px 0 2px 38px",

    boxSizing: "border-box",

    borderRadius: 0,

    border: "none",

    background: "transparent",

    boxShadow: "none",

    display: "flex",

    flexDirection: "column",

    justifyContent: "center",

    alignItems: "flex-end",

    textAlign: "right",

  },

  bankInfoLabel: {

    margin: 0,

    width: "100%",

    color: "#45dbc3",

    fontSize: "7px",

    fontWeight: 800,

    letterSpacing: "1.4px",

    textAlign: "right",

  },

  bankInfoTitle: {

    margin: "4px 0 4px",

    width: "100%",

    color: "#fff",

    fontSize: "16px",

    textAlign: "right",

  },

  bankInfoText: {

    margin: 0,

    width: "100%",

    color: "#98abb7",

    fontSize: "9px",

    lineHeight: 1.5,

    textAlign: "right",

  },

  editInfoButton: {

    marginTop: "11px",

    padding: "7px 11px",

    alignSelf: "flex-end",

    borderRadius: "9px",

    border:

      "1px solid rgba(255,255,255,0.07)",

    background:

      "rgba(255,255,255,0.035)",

    color: "#d6e2e8",

    cursor: "pointer",

    fontSize: "9px",

  },

  bankInfoDetails: {

    width: "100%",

    display: "flex",

    flexWrap: "wrap",

    justifyContent: "flex-end",

    gap: "3px 12px",

    paddingRight: 0,

    color: "#a9bdc8",

    fontSize: "8px",

    lineHeight: 1.5,

    textAlign: "right",

  },

  bankInfoEditPencil: {

    position: "absolute",

    left: "0px",

    right: "auto",

    top: "50%",

    transform: "translateY(-50%)",

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

  bankInfoModal: {

    width: "100%",

    maxWidth: "620px",

    maxHeight: "calc(100vh - 36px)",

    overflowY: "auto",

    padding: "22px",

    boxSizing: "border-box",

    borderRadius: "20px",

    border:

      "1px solid rgba(255,255,255,0.08)",

    background: "#071c26",

    boxShadow:

      "0 24px 70px rgba(0,0,0,0.5)",

  },

  bankInfoFormGrid: {

    display: "grid",

    gridTemplateColumns:

      "repeat(2, minmax(0, 1fr))",

    gap: "13px",

  },

  bankInfoField: {

    display: "flex",

    flexDirection: "column",

    gap: "6px",

  },

  bankInfoFieldFull: {

    display: "flex",

    flexDirection: "column",

    gap: "6px",

    gridColumn: "1 / -1",

  },

  bankInfoFieldLabel: {

    color: "#a9bdc8",

    fontSize: "10px",

    fontWeight: 700,

  },

  bankInfoInput: {

    width: "100%",

    boxSizing: "border-box",

    padding: "11px 12px",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.09)",

    outline: "none",

    background:

      "rgba(255,255,255,0.045)",

    color: "#fff",

    fontSize: "11px",

  },

  bankInfoTextarea: {

    width: "100%",

    boxSizing: "border-box",

    minHeight: "82px",

    padding: "11px 12px",

    resize: "vertical",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.09)",

    outline: "none",

    background:

      "rgba(255,255,255,0.045)",

    color: "#fff",

    fontFamily:

      "Inter, Arial, sans-serif",

    fontSize: "11px",

  },

  bankInfoModalActions: {

    display: "flex",

    justifyContent: "flex-end",

    gap: "9px",

    marginTop: "18px",

  },

  bankInfoCancelButton: {

    padding: "9px 14px",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.08)",

    background:

      "rgba(255,255,255,0.04)",

    color: "#b8c8d1",

    cursor: "pointer",

    fontSize: "10px",

    fontWeight: 700,

  },

  bankInfoSaveButton: {

    padding: "9px 14px",

    borderRadius: "10px",

    border:

      "1px solid rgba(65,225,196,0.22)",

    background:

      "linear-gradient(135deg,#32d9bd,#249bd6)",

    color: "#03232a",

    cursor: "pointer",

    fontSize: "10px",

    fontWeight: 800,

  },

  passwordModal: {

    width: "100%",

    maxWidth: "480px",

    padding: "22px",

    boxSizing: "border-box",

    borderRadius: "20px",

    border: "1px solid rgba(255,255,255,0.08)",

    background: "#071c26",

    boxShadow: "0 24px 70px rgba(0,0,0,0.5)",

  },

  passwordEyebrow: {

    margin: 0,

    color: "#45dbc3",

    fontSize: "8px",

    fontWeight: 800,

    letterSpacing: "1.4px",

  },

  passwordHelpText: {

    margin: "7px 0 0",

    color: "#8fa7b4",

    fontSize: "10px",

    lineHeight: 1.5,

  },

  passwordForm: {

    display: "flex",

    flexDirection: "column",

    gap: "13px",

  },

  passwordField: {

    display: "flex",

    flexDirection: "column",

    gap: "6px",

  },

  passwordInput: {

    width: "100%",

    boxSizing: "border-box",

    padding: "11px 12px",

    borderRadius: "10px",

    border: "1px solid rgba(255,255,255,0.09)",

    outline: "none",

    background: "rgba(255,255,255,0.045)",

    color: "#fff",

    fontSize: "12px",

  },

  passwordError: {

    padding: "10px 11px",

    borderRadius: "10px",

    border: "1px solid rgba(255,112,112,0.18)",

    background: "rgba(255,90,90,0.08)",

    color: "#ffaaaa",

    fontSize: "10px",

    lineHeight: 1.45,

  },

  passwordActions: {

    display: "flex",

    justifyContent: "flex-end",

    gap: "9px",

    marginTop: "18px",

  },

  passwordCancelButton: {

    padding: "10px 14px",

    borderRadius: "10px",

    border: "1px solid rgba(255,255,255,0.08)",

    background: "rgba(255,255,255,0.04)",

    color: "#b8c8d1",

    cursor: "pointer",

    fontSize: "10px",

    fontWeight: 700,

  },

  passwordSaveButton: {

    padding: "10px 14px",

    borderRadius: "10px",

    border: "1px solid rgba(65,225,196,0.22)",

    background: "linear-gradient(135deg,#32d9bd,#249bd6)",

    color: "#03232a",

    cursor: "pointer",

    fontSize: "10px",

    fontWeight: 800,

  },

  themeModal: {

    width: "100%",

    maxWidth: "520px",

    padding: "22px",

    boxSizing: "border-box",

    borderRadius: "20px",

    border: "1px solid rgba(255,255,255,0.08)",

    background: "#071c26",

    boxShadow: "0 24px 70px rgba(0,0,0,0.5)",

  },

  themeGrid: {

    display: "grid",

    gridTemplateColumns: "repeat(2,minmax(0,1fr))",

    gap: "10px",

    marginTop: "18px",

  },

  themeChoice: {

    minWidth: 0,

    display: "flex",

    alignItems: "center",

    gap: "10px",

    padding: "11px",

    borderRadius: "12px",

    border: "1px solid rgba(255,255,255,0.08)",

    background: "rgba(255,255,255,0.035)",

    color: "#d9e6eb",

    cursor: "pointer",

    textAlign: "left",

    fontSize: "11px",

  },

  themeChoiceActive: {

    border: "1px solid rgba(71,226,200,0.42)",

    background: "rgba(71,226,200,0.09)",

    color: "#58e5cd",

  },

  themeSwatch: {

    width: "34px",

    height: "34px",

    flexShrink: 0,

    borderRadius: "10px",

    border: "1px solid rgba(255,255,255,0.16)",

    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",

  },

  themeSelected: {

    marginLeft: "auto",

    fontSize: "14px",

  },

  syncErrorBanner: {

    width: "100%",

    boxSizing: "border-box",

    display: "flex",

    alignItems: "center",

    gap: "10px",

    margin: "0 0 14px",

    padding: "10px 13px",

    borderRadius: "12px",

    border: "1px solid rgba(184,83,83,0.26)",

    background: "linear-gradient(135deg,rgba(88,25,31,0.94),rgba(64,24,31,0.94))",

    color: "#ffe3e3",

    boxShadow: "0 8px 22px rgba(65,20,25,0.12)",

  },

  syncErrorIcon: {

    width: "30px",

    height: "30px",

    flexShrink: 0,

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    borderRadius: "9px",

    background: "rgba(255,255,255,0.08)",

    color: "#ffc5c5",

    fontWeight: 900,

  },

  syncErrorTitle: {

    display: "block",

    fontSize: "10px",

    marginBottom: "2px",

  },

  syncErrorText: {

    display: "block",

    color: "#f5caca",

    fontSize: "9px",

    lineHeight: 1.4,

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

      "1px solid rgba(71,226,200,0.14)",

    background:

      "linear-gradient(145deg,#0a2836,#0d3342)",

    boxShadow:

      "0 10px 28px rgba(0,0,0,0.16)",

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

      "linear-gradient(145deg,#0a2836,#0d3342)",

    border:

      "1px solid rgba(71,226,200,0.12)",

    boxShadow:

      "0 10px 28px rgba(0,0,0,0.14)",

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

      "1px solid rgba(71,226,200,0.12)",

    borderRadius: "14px",

    background: "#0b2d3a",

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

      "linear-gradient(145deg,#0a2836,#0d3342)",

    border:

      "1px solid rgba(71,226,200,0.12)",

    boxShadow:

      "0 10px 28px rgba(0,0,0,0.14)",

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
