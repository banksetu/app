import { useEffect, useRef, useState } from "react";

import { getAuth } from "firebase/auth";

import {

  doc,

  getDoc,

  serverTimestamp,

  setDoc,

} from "firebase/firestore";

import { db } from "./firebase";

import type {

  ChangeEvent,

  CSSProperties,

} from "react";

import CustomerEntry from "./CustomerEntry";

import Settings from "./Settings";

import AdvancedAdmin from "./AdvancedAdmin";

import Passbook from "./Passbook";

import Customers from "./Customers";

import Reports from "./Reports";

import AccountOpeningPDF from "./AccountOpeningPDF";

import bankSetuLogo from "./assets/bank-setu-logo.png";

type DashboardProps = {

  onLogout: () => void;

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

  const [bankInfo, setBankInfo] =

    useState<BankInfo>(() => {

      try {

        const saved = localStorage.getItem(

          "bankSetuBankInfo"

        );

        if (!saved) return emptyBankInfo;

        return {

          ...emptyBankInfo,

          ...JSON.parse(saved),

        };

      } catch (error) {

        console.error(

          "Bank information load failed:",

          error

        );

        return emptyBankInfo;

      }

    });

  const [bankInfoDraft, setBankInfoDraft] =

    useState<BankInfo>(emptyBankInfo);

  const [bankInfoEditOpen, setBankInfoEditOpen] =

    useState(false);

  const saveCloudSettings = async (

    patch: Record<string, unknown>

  ) => {

    const user = getAuth().currentUser;

    if (!user) {

      throw new Error(

        "Firebase login session is not available. Please login again."

      );

    }

    await setDoc(

      doc(db, "appSettings", user.uid),

      {

        ...patch,

        updatedAt: serverTimestamp(),

      },

      { merge: true }

    );

  };

  useEffect(() => {

    let cancelled = false;

    const loadCloudSettings = async () => {

      const user = getAuth().currentUser;

      if (!user) {

        return;

      }

      let localInfo: BankInfo = {

        ...emptyBankInfo,

      };

      try {

        const savedInfo = localStorage.getItem(

          "bankSetuBankInfo"

        );

        if (savedInfo) {

          localInfo = {

            ...emptyBankInfo,

            ...JSON.parse(savedInfo),

          };

        }

      } catch (error) {

        console.error(

          "Local bank information migration read failed:",

          error

        );

      }

      const localLogo =

        localStorage.getItem(

          "bankSetuBankLogo"

        ) || "";

      try {

        const settingsRef = doc(

          db,

          "appSettings",

          user.uid

        );

        const settingsSnap =

          await getDoc(settingsRef);

        const cloudData =

          settingsSnap.exists()

            ? settingsSnap.data()

            : {};

        const cloudInfo: BankInfo = {

          bankName:

            typeof cloudData.bankName === "string"

              ? cloudData.bankName

              : localInfo.bankName,

          passbookBank:

            typeof cloudData.passbookBank === "string"

              ? cloudData.passbookBank

              : localInfo.passbookBank,

          branchName:

            typeof cloudData.branchName === "string"

              ? cloudData.branchName

              : localInfo.branchName,

          cspCode:

            typeof cloudData.cspCode === "string"

              ? cloudData.cspCode

              : localInfo.cspCode,

          operatorName:

            typeof cloudData.operatorName === "string"

              ? cloudData.operatorName

              : localInfo.operatorName,

          address:

            typeof cloudData.address === "string"

              ? cloudData.address

              : localInfo.address,

        };

        const cloudLogo =

          typeof cloudData.bankLogo === "string"

            ? cloudData.bankLogo

            : localLogo;

        const cloudApiUrl =

          typeof cloudData.apiUrl === "string"

            ? cloudData.apiUrl.trim()

            : "";

        if (cloudApiUrl) {

          localStorage.setItem(

            "bankSetuApiUrl",

            cloudApiUrl

          );

        }

        if (!cancelled) {

          setBankInfo(cloudInfo);

          if (cloudLogo) {

            setBankLogo(cloudLogo);

          }

        }

        try {

          localStorage.setItem(

            "bankSetuBankInfo",

            JSON.stringify(cloudInfo)

          );

          if (cloudLogo) {

            localStorage.setItem(

              "bankSetuBankLogo",

              cloudLogo

            );

          }

        } catch (error) {

          console.error(

            "Cloud settings local cache failed:",

            error

          );

        }

        const migrationPatch: Record<

          string,

          unknown

        > = {};

        if (

          typeof cloudData.bankName !== "string" &&

          localInfo.bankName

        ) {

          migrationPatch.bankName =

            localInfo.bankName;

        }

        if (

          typeof cloudData.passbookBank !== "string" &&

          localInfo.passbookBank

        ) {

          migrationPatch.passbookBank =

            localInfo.passbookBank;

        }

        if (

          typeof cloudData.branchName !== "string" &&

          localInfo.branchName

        ) {

          migrationPatch.branchName =

            localInfo.branchName;

        }

        if (

          typeof cloudData.cspCode !== "string" &&

          localInfo.cspCode

        ) {

          migrationPatch.cspCode =

            localInfo.cspCode;

        }

        if (

          typeof cloudData.operatorName !== "string" &&

          localInfo.operatorName

        ) {

          migrationPatch.operatorName =

            localInfo.operatorName;

        }

        if (

          typeof cloudData.address !== "string" &&

          localInfo.address

        ) {

          migrationPatch.address =

            localInfo.address;

        }

        if (

          typeof cloudData.bankLogo !== "string" &&

          localLogo

        ) {

          migrationPatch.bankLogo =

            localLogo;

        }

        if (

          Object.keys(

            migrationPatch

          ).length > 0

        ) {

          await setDoc(

            settingsRef,

            {

              ...migrationPatch,

              updatedAt:

                serverTimestamp(),

            },

            { merge: true }

          );

        }

      } catch (error) {

        console.error(

          "Bank cloud settings load failed:",

          error

        );

      }

    };

    void loadCloudSettings();

    return () => {

      cancelled = true;

    };

  }, []);

  const hasBankInfo =

    Object.values(bankInfo).some(

      (value) => value.trim() !== ""

    );

  const openBankInfoEditor = () => {

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

      await saveCloudSettings({

        ...cleaned,

      });

      setBankInfo(cleaned);

      localStorage.setItem(

        "bankSetuBankInfo",

        JSON.stringify(cleaned)

      );

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

    reader.onload = async () => {

      const result = reader.result;

      if (typeof result !== "string") {

        return;

      }

      try {

        await saveCloudSettings({

          bankLogo: result,

        });

        setBankLogo(result);

        localStorage.setItem(

          "bankSetuBankLogo",

          result

        );

      } catch (error) {

        console.error(

          "Logo cloud save failed:",

          error

        );

        alert(

          "Bank logo could not be saved to Firebase Cloud. Please try again."

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

        <header className="dashboard-top-bar" style={styles.topBar}>

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

            <div

              className={`bank-info-strip ${

                hasBankInfo ? "has-info" : ""

              }`}

              style={styles.bankInfoStrip}

            >

              <p style={styles.bankInfoLabel}>

                BANK INFORMATION

              </p>

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

              {hasBankInfo ? (

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

              )}

            </div>

          </section>

          <div className="admin-wrapper" style={styles.adminWrapper}>

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

            <Customers />

          )}

          {activePage === "passbook" && (

            <Passbook selectedBank={bankInfo.passbookBank} />

          )}

          {activePage === "search" && (

          bankInfo.passbookBank === "Assam Gramin Bank" ? (

            <AccountOpeningPDF />

          ) : (

            <ComingSoon

              title="Account Opening PDF Sample"

              text="This PDF template is currently available only for Assam Gramin Bank. Please select Assam Gramin Bank in Bank Information."

            />

          )

        )}

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

            .bank-info-edit-pencil {

              opacity: 0.85;

              transform: scale(1);

            }

          }

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

              grid-template-columns: 42px minmax(0, 1fr) 42px !important;

              align-items: start !important;

              gap: 10px !important;

              min-height: auto !important;

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

\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\========================= */

function DashboardHome({

  openPage,

}: {

  openPage: (page: PageName) => void;

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

  useEffect(() => {

    let cancelled = false;

    const loadDashboardStats = async () => {

      setStatsLoading(true);

      setStatsError("");

      try {

        const apiUrl =

          localStorage

            .getItem("bankSetuApiUrl")

            ?.trim() || "";

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

        const idToken = await user.getIdToken();

        const response = await fetch(apiUrl, {

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

        const result = await response.json();

        if (!result?.success) {

          throw new Error(

            result?.message ||

              "Dashboard statistics could not be loaded."

          );

        }

        const liveStats = result.stats || {};

        if (!cancelled) {

          setDashboardStats({

            totalCustomers: Number(

              liveStats.totalCustomers || 0

            ),

            kycPending: Number(

              liveStats.kycPending || 0

            ),

            passbookPending: Number(

              liveStats.passbookPending || 0

            ),

            inactiveAccounts: Number(

              liveStats.inactiveAccounts || 0

            ),

          });

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

  }, []);

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

      <section style={styles.statsGrid}>

        {stats.map(([icon, title, value]) => (

          <article

            key={title}

            style={styles.statCard}

          >

            <div style={styles.statTop}>

              <div style={styles.statIcon}>

                {icon}

              </div>

              <span style={styles.statBadge}>

                {statsLoading ? "SYNC" : "LIVE"}

              </span>

            </div>

            <div style={styles.statValue}>

              {statsLoading ? "…" : value}

            </div>

            <h3 style={styles.statTitle}>

              {title}

            </h3>

          </article>

        ))}

      </section>

      {statsError && (

        <div

          style={{

            margin: "-8px 0 18px",

            padding: "10px 13px",

            borderRadius: "12px",

            border:

              "1px solid rgba(255,144,144,0.18)",

            background:

              "rgba(255,100,100,0.06)",

            color: "#ffb0b0",

            fontSize: "10px",

          }}

        >

          Dashboard sync error: {statsError}

        </div>

      )}

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

            title="Account Opening PDF"

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

\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\========================= */

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

\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\========================= */

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

\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\========================= */

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

\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\========================= */

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

    padding: "8px 32px 45px",

  },

  topBar: {

    display: "flex",

    alignItems: "center",

    gap: "18px",

    marginBottom: "14px",

    minHeight: "76px",

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

    flex: 1,

    minWidth: 0,

    display: "grid",

    gridTemplateColumns:

      "minmax(210px, 1fr) minmax(360px, 620px)",

    alignItems: "center",

    justifyContent: "space-between",

    gap: "18px",

    margin: 0,
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