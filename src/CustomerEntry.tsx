import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  CSSProperties,
} from "react";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

import { auth } from "./firebase";


/* =========================================================
   TYPES
========================================================= */

type CustomerForm = {
  aofNo: string;
  enrolId: string;
  accountNo: string;
  name: string;
  coName: string;
  nominee: string;
  gender: string;
  contact: string;
  status: string;
  accountOpeningDate: string;
  address: string;
  postOffice: string;
  fullAddress: string;
  pinCode: string;
  pan: string;
  uidaiNo: string;
  dbtStatus: string;
  purposeOfAdvance: string;
  passbookStatus: string;
};


type SearchCustomerResponse = {
  success: boolean;
  message?: string;
  rowNumber?: number;

  customer?: Partial<CustomerForm> & {
    photoUrl?: string;
    photoPreview?: string;
    pdfUrl?: string;

    passbookDisplay?: {
      code?: string;
      label?: string;
    };
  };
};


type ApiResponse = {
  success: boolean;
  message?: string;
  code?: string;
  rowNumber?: number;

  photo?: {
    fileId?: string;
    driveUrl?: string;
  } | null;
};


/* =========================================================
   INITIAL FORM
========================================================= */

const emptyForm: CustomerForm = {
  aofNo: "",
  enrolId: "",
  accountNo: "",
  name: "",
  coName: "",
  nominee: "",
  gender: "",
  contact: "",
  status: "",
  accountOpeningDate: "",
  address: "",
  postOffice: "",
  fullAddress: "",
  pinCode: "",
  pan: "",
  uidaiNo: "",
  dbtStatus: "",
  purposeOfAdvance: "",
  passbookStatus: "",
};


const API_STORAGE_KEY =
  "bankSetuApiUrl";


/* =========================================================
   COMPONENT
========================================================= */

function CustomerEntry() {
  const [form, setForm] =
    useState<CustomerForm>({
      ...emptyForm,
    });

  const [searchText, setSearchText] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [messageType, setMessageType] =
    useState<
      "success" | "error" | "info"
    >("info");

  const [saving, setSaving] =
    useState(false);

  const [searching, setSearching] =
    useState(false);

  const [updating, setUpdating] =
    useState(false);

  const [deleteLoading, setDeleteLoading] =
    useState(false);

  /*
    Search से customer मिलने के बाद
    Google Sheet row number यहाँ रहेगा.
  */

  const [loadedRowNumber, setLoadedRowNumber] =
    useState<number | null>(null);

  const [loadedPhotoUrl, setLoadedPhotoUrl] =
    useState("");

  const [photoPreview, setPhotoPreview] =
    useState("");

  const [photoDataUrl, setPhotoDataUrl] =
    useState("");

  const [photoFileName, setPhotoFileName] =
    useState("");

  const [selectedPdfName, setSelectedPdfName] =
    useState("");

  const [deleteModalOpen, setDeleteModalOpen] =
    useState(false);

  const [deletePassword, setDeletePassword] =
    useState("");

  const [deleteConfirmText, setDeleteConfirmText] =
    useState("");

  const photoInputRef =
    useRef<HTMLInputElement | null>(null);

  const pdfInputRef =
    useRef<HTMLInputElement | null>(null);


  /*
    Loaded row मौजूद है = Search/Edit mode.
    नहीं है = New Customer mode.
  */

  const editMode =
    loadedRowNumber !== null;


  useEffect(() => {
    return () => {
      /*
        अभी preview Data URL है,
        इसलिए revoke की जरूरत नहीं.
      */
    };
  }, []);


  /* =========================================================
     FIELD CHANGE
  ========================================================= */

  const changeField = (
    field: keyof CustomerForm,
    value: string
  ) => {
    let finalValue = value;

    /*
      Numeric-like sensitive identifiers को
      text के रूप में ही रखते हैं.
    */

    if (
      field === "uidaiNo" ||
      field === "contact" ||
      field === "pinCode"
    ) {
      finalValue =
        value.replace(/\D/g, "");
    }

    if (field === "uidaiNo") {
      finalValue =
        finalValue.slice(0, 12);
    }

    if (field === "contact") {
      finalValue =
        finalValue.slice(0, 15);
    }

    if (field === "pinCode") {
      finalValue =
        finalValue.slice(0, 10);
    }

    if (field === "pan") {
      finalValue =
        value.toUpperCase();
    }

    setForm((previous) => ({
      ...previous,
      [field]: finalValue,
    }));
  };


  /* =========================================================
     GET SAVED API URL
  ========================================================= */

  const getApiUrl = () => {
    const apiUrl =
      localStorage.getItem(
        API_STORAGE_KEY
      )?.trim();

    if (!apiUrl) {
      throw new Error(
        "Google Sheet API is not configured. Open Advanced Administrator Control first."
      );
    }

    return apiUrl;
  };


  /* =========================================================
     FIREBASE TOKEN
  ========================================================= */

  const getFreshIdToken = async (
    forceRefresh = false
  ) => {
    const user =
      auth.currentUser;

    if (!user) {
      throw new Error(
        "Your login session has expired. Please login again."
      );
    }

    return user.getIdToken(
      forceRefresh
    );
  };


  /* =========================================================
     PROTECTED API REQUEST
  ========================================================= */

  const apiRequest = async <T,>(
    payload: Record<string, unknown>,
    forceFreshToken = false
  ): Promise<T> => {
    const apiUrl =
      getApiUrl();

    const idToken =
      await getFreshIdToken(
        forceFreshToken
      );

    /*
      text/plain रखने से Apps Script के साथ
      unnecessary browser preflight problem
      कम होती है.

      Body अभी भी JSON है.
    */

    const response =
      await fetch(apiUrl, {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8",
        },

        body: JSON.stringify({
          ...payload,
          idToken,
        }),
      });

    const text =
      await response.text();

    let result: T;

    try {
      result =
        JSON.parse(text) as T;
    } catch {
      throw new Error(
        "Bank Setu API returned an invalid response."
      );
    }

    return result;
  };


  /* =========================================================
     PHOTO
  ========================================================= */

  const handlePhotoSelect = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(file.type)
    ) {
      showMessage(
        "Only JPG, PNG or WEBP customer photos are allowed.",
        "error"
      );

      event.target.value = "";
      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      showMessage(
        "Customer photo must be smaller than 5 MB.",
        "error"
      );

      event.target.value = "";
      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {
      if (
        typeof reader.result !==
        "string"
      ) {
        return;
      }

      setPhotoPreview(
        reader.result
      );

      setPhotoDataUrl(
        reader.result
      );

      setPhotoFileName(
        file.name
      );

      showMessage(
        "New customer photo selected.",
        "info"
      );
    };

    reader.readAsDataURL(file);

    event.target.value = "";
  };


  const removeSelectedPhoto = () => {
    /*
      Edit mode में सिर्फ नया selected
      photo हटेगा. Existing Drive photo
      delete नहीं होगा.
    */

    setPhotoDataUrl("");
    setPhotoFileName("");

    if (editMode) {
      /*
        Existing searched photo वापस दिखाएँ.
        हमारे पास Base64 original अलग store
        नहीं है, इसलिए loaded photo को search
        result preview में preserve करने के लिए
        current state only reset नहीं करेंगे.
      */

      showMessage(
        "New photo selection removed. Existing saved photo will remain unchanged.",
        "info"
      );

      return;
    }

    setPhotoPreview("");

    showMessage(
      "Photo removed.",
      "info"
    );
  };


  /* =========================================================
     PDF PLACEHOLDER
  ========================================================= */

  const handlePdfSelect = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      file.type !==
      "application/pdf"
    ) {
      showMessage(
        "Please select a PDF file.",
        "error"
      );

      event.target.value = "";
      return;
    }

    setSelectedPdfName(
      file.name
    );

    showMessage(
      "PDF selected. Automatic PDF data extraction will be connected next.",
      "info"
    );

    event.target.value = "";
  };


  /* =========================================================
     VALIDATE FORM
  ========================================================= */

  const validateForm = () => {
    if (!form.name.trim()) {
      showMessage(
        "Customer Name is required.",
        "error"
      );

      return false;
    }

    if (!form.accountNo.trim()) {
      showMessage(
        "Account Number is required.",
        "error"
      );

      return false;
    }

    if (!form.enrolId.trim()) {
      showMessage(
        "Customer ID / ENDROL ID is required.",
        "error"
      );

      return false;
    }

    if (
      form.uidaiNo.length !== 12
    ) {
      showMessage(
        "UIDAI / Aadhaar Number must contain exactly 12 digits.",
        "error"
      );

      return false;
    }

    return true;
  };


  /* =========================================================
     SAVE NEW CUSTOMER
  ========================================================= */

  const saveCustomer = async () => {
    if (!validateForm()) {
      return;
    }

    if (editMode) {
      showMessage(
        "This is an existing customer. Use Update Customer instead.",
        "error"
      );

      return;
    }

    setSaving(true);

    showMessage(
      "Saving customer...",
      "info"
    );

    try {
      const result =
        await apiRequest<ApiResponse>({
          action:
            "saveCustomer",

          customer: {
            ...form,

            photoDataUrl,

            photoFileName,
          },
        });

      if (!result.success) {
        showMessage(
          result.message ||
            "Customer could not be saved.",
          "error"
        );

        return;
      }

      showMessage(
        result.message ||
          "Customer saved successfully.",
        "success"
      );

      /*
        Successful save के बाद
        fresh blank form.
      */

      clearFormOnly();

    } catch (error) {
      showMessage(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setSaving(false);
    }
  };


  /* =========================================================
     SEARCH
  ========================================================= */

  const searchCustomer = async () => {
    const query =
      searchText.trim();

    if (!query) {
      showMessage(
        "Enter Account Number, Customer ID, Aadhaar, Mobile, Name, PAN or AOF Number.",
        "error"
      );

      return;
    }

    setSearching(true);

    showMessage(
      "Searching customer...",
      "info"
    );

    try {
      const result =
        await apiRequest<SearchCustomerResponse>({
          action:
            "searchCustomer",

          query,
        });

      if (
        !result.success ||
        !result.customer ||
        !result.rowNumber
      ) {
        showMessage(
          result.message ||
            "Customer not found.",
          "error"
        );

        return;
      }

      const customer =
        result.customer;

      setForm({
        aofNo:
          customer.aofNo || "",

        enrolId:
          customer.enrolId || "",

        accountNo:
          customer.accountNo || "",

        name:
          customer.name || "",

        coName:
          customer.coName || "",

        nominee:
          customer.nominee || "",

        gender:
          customer.gender || "",

        contact:
          customer.contact || "",

        status:
          customer.status || "",

        accountOpeningDate:
          customer.accountOpeningDate || "",

        address:
          customer.address || "",

        postOffice:
          customer.postOffice || "",

        fullAddress:
          customer.fullAddress || "",

        pinCode:
          customer.pinCode || "",

        pan:
          customer.pan || "",

        uidaiNo:
          customer.uidaiNo || "",

        dbtStatus:
          customer.dbtStatus || "",

        purposeOfAdvance:
          customer.purposeOfAdvance || "",

        passbookStatus:
          customer.passbookStatus || "",
      });

      setLoadedRowNumber(
        result.rowNumber
      );

      setLoadedPhotoUrl(
        customer.photoUrl || ""
      );

      setPhotoPreview(
        customer.photoPreview || ""
      );

      /*
        Search के बाद कोई new photo
        selected नहीं माना जाएगा.
      */

      setPhotoDataUrl("");
      setPhotoFileName("");

      showMessage(
        result.message ||
          "Customer loaded successfully.",
        "success"
      );

    } catch (error) {
      showMessage(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setSearching(false);
    }
  };


  /* =========================================================
     UPDATE CUSTOMER
  ========================================================= */

  const updateCustomer = async () => {
    if (!loadedRowNumber) {
      showMessage(
        "Search and load a customer before updating.",
        "error"
      );

      return;
    }

    if (!validateForm()) {
      return;
    }

    const confirmed =
      window.confirm(
        `Update customer "${form.name}"?`
      );

    if (!confirmed) {
      return;
    }

    setUpdating(true);

    showMessage(
      "Updating customer...",
      "info"
    );

    try {
      const result =
        await apiRequest<ApiResponse>({
          action:
            "updateCustomer",

          rowNumber:
            loadedRowNumber,

          customer: {
            ...form,

            /*
              New photo select हुआ है तभी
              backend photo replace करेगा.
            */

            photoDataUrl,

            photoFileName,

            photoUrl:
              loadedPhotoUrl,
          },
        });

      if (!result.success) {
        showMessage(
          result.message ||
            "Customer update failed.",
          "error"
        );

        return;
      }

      showMessage(
        result.message ||
          "Customer updated successfully.",
        "success"
      );

      /*
        Updated version फिर से search करें,
        ताकि latest Drive photo भी वापस load हो.
      */

      const refreshQuery =
        form.accountNo ||
        form.enrolId;

      if (refreshQuery) {
        setSearchText(
          refreshQuery
        );
      }

      setPhotoDataUrl("");
      setPhotoFileName("");

    } catch (error) {
      showMessage(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setUpdating(false);
    }
  };


  /* =========================================================
     OPEN DELETE CONFIRMATION
  ========================================================= */

  const openDeleteModal = () => {
    if (!loadedRowNumber) {
      showMessage(
        "Search a customer first.",
        "error"
      );

      return;
    }

    setDeletePassword("");
    setDeleteConfirmText("");
    setDeleteModalOpen(true);
  };


  /* =========================================================
     DELETE WITH FIREBASE RE-AUTH
  ========================================================= */

  const deleteCustomer = async () => {
    if (!loadedRowNumber) {
      return;
    }

    if (!deletePassword) {
      showMessage(
        "Enter the current administrator password.",
        "error"
      );

      return;
    }

    if (
      deleteConfirmText.trim().toUpperCase() !==
      "DELETE CUSTOMER"
    ) {
      showMessage(
        'Type "DELETE CUSTOMER" exactly to confirm.',
        "error"
      );

      return;
    }

    const user =
      auth.currentUser;

    if (
      !user ||
      !user.email
    ) {
      showMessage(
        "Administrator login session was not found.",
        "error"
      );

      return;
    }

    setDeleteLoading(true);

    showMessage(
      "Verifying administrator...",
      "info"
    );

    try {
      /*
        Step 1:
        Firebase password verification.
      */

      const credential =
        EmailAuthProvider.credential(
          user.email,
          deletePassword
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      /*
        Step 2:
        Re-authentication के बाद
        fresh Firebase ID token.
      */

      const freshToken =
        await user.getIdToken(
          true
        );

      /*
        Step 3:
        Backend फिर Firestore role देखेगा.
        केवल role=admin delete कर पाएगा.
      */

      const apiUrl =
        getApiUrl();

      const response =
        await fetch(apiUrl, {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8",
          },

          body: JSON.stringify({
            action:
              "deleteCustomer",

            rowNumber:
              loadedRowNumber,

            idToken:
              freshToken,
          }),
        });

      const result =
        (await response.json()) as ApiResponse;

      if (!result.success) {
        showMessage(
          result.message ||
            "Customer deletion failed.",
          "error"
        );

        return;
      }

      setDeleteModalOpen(false);

      showMessage(
        result.message ||
          "Customer deleted successfully.",
        "success"
      );

      clearFormOnly();
      setSearchText("");

    } catch (error) {
      console.error(error);

      showMessage(
        "Administrator verification failed or you do not have permission to delete this customer.",
        "error"
      );

    } finally {
      setDeleteLoading(false);
      setDeletePassword("");
      setDeleteConfirmText("");
    }
  };


  /* =========================================================
     NEW CUSTOMER
  ========================================================= */

  const startNewCustomer = () => {
    clearFormOnly();

    setSearchText("");

    showMessage(
      "New Customer mode ready.",
      "info"
    );
  };


  const clearFormOnly = () => {
    setForm({
      ...emptyForm,
    });

    setLoadedRowNumber(
      null
    );

    setLoadedPhotoUrl(
      ""
    );

    setPhotoPreview(
      ""
    );

    setPhotoDataUrl(
      ""
    );

    setPhotoFileName(
      ""
    );

    setSelectedPdfName(
      ""
    );
  };


  /* =========================================================
     MESSAGE
  ========================================================= */

  const showMessage = (
    text: string,
    type:
      | "success"
      | "error"
      | "info"
  ) => {
    setMessage(text);
    setMessageType(type);
  };


  /* =========================================================
     UI
  ========================================================= */

  return (
    <div style={styles.wrapper}>
      {/* PAGE TITLE */}

      <div style={styles.pageHeading}>
        <p style={styles.eyebrow}>
          BANK SETU
        </p>

        <h1 style={styles.heading}>
          Customer Entry
        </h1>

        <p style={styles.subtitle}>
          Add Customer • Search Customer • Upload Information
        </p>
      </div>


      {/* MODE INDICATOR */}

      <div
        style={{
          ...styles.modeBar,

          ...(editMode
            ? styles.editModeBar
            : styles.newModeBar),
        }}
      >
        <div>
          <strong>
            {editMode
              ? "Existing Customer Mode"
              : "New Customer Mode"}
          </strong>

          <span style={styles.modeDescription}>
            {editMode
              ? `Loaded Google Sheet Row: ${loadedRowNumber}`
              : "Fill the form and save a new customer."}
          </span>
        </div>

        {editMode && (
          <button
            type="button"
            style={styles.newCustomerButton}
            onClick={startNewCustomer}
          >
            ＋ New Customer
          </button>
        )}
      </div>


      {/* TOP TOOLS */}

      <section style={styles.topGrid}>
        {/* SEARCH */}

        <div style={styles.toolCard}>
          <p style={styles.cardLabel}>
            CUSTOMER SEARCH
          </p>

          <h2 style={styles.toolTitle}>
            Find Customer
          </h2>

          <p style={styles.toolDescription}>
            Account No, Customer ID, Aadhaar,
            Mobile, Name, PAN or AOF No.
          </p>

          <div style={styles.searchRow}>
            <input
              type="text"
              value={searchText}
              placeholder="Search customer..."
              style={styles.searchInput}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  searchCustomer();
                }
              }}
            />

            <button
              type="button"
              style={styles.searchButton}
              onClick={searchCustomer}
              disabled={searching}
            >
              {searching
                ? "Searching..."
                : "Search"}
            </button>
          </div>
        </div>


        {/* PHOTO */}

        <div style={styles.photoCard}>
          <p style={styles.cardLabel}>
            CUSTOMER PHOTO
          </p>

          <div style={styles.photoArea}>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Customer"
                style={styles.photoImage}
              />
            ) : (
              <div style={styles.photoPlaceholder}>
                <span style={styles.photoIcon}>
                  👤
                </span>

                <span>
                  No Photo
                </span>
              </div>
            )}
          </div>

          <div style={styles.photoActions}>
            <button
              type="button"
              style={styles.smallButton}
              onClick={() =>
                photoInputRef.current?.click()
              }
            >
              {photoPreview
                ? "Change Photo"
                : "Upload Photo"}
            </button>

            {photoDataUrl && (
              <button
                type="button"
                style={styles.secondarySmallButton}
                onClick={removeSelectedPhoto}
              >
                Cancel New Photo
              </button>
            )}
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{
              display: "none",
            }}
            onChange={handlePhotoSelect}
          />
        </div>


        {/* PDF */}

        <div style={styles.toolCard}>
          <p style={styles.cardLabel}>
            PDF IMPORT
          </p>

          <h2 style={styles.toolTitle}>
            Customer PDF
          </h2>

          <p style={styles.toolDescription}>
            PDF auto form-fill will be connected in the next step.
          </p>

          <button
            type="button"
            style={styles.pdfButton}
            onClick={() =>
              pdfInputRef.current?.click()
            }
          >
            📄 Select PDF
          </button>

          {selectedPdfName && (
            <div style={styles.pdfName}>
              {selectedPdfName}
            </div>
          )}

          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            style={{
              display: "none",
            }}
            onChange={handlePdfSelect}
          />
        </div>
      </section>


      {/* MESSAGE */}

      {message && (
        <div
          style={{
            ...styles.message,

            ...(messageType === "success"
              ? styles.successMessage
              : {}),

            ...(messageType === "error"
              ? styles.errorMessage
              : {}),

            ...(messageType === "info"
              ? styles.infoMessage
              : {}),
          }}
        >
          {message}
        </div>
      )}


      {/* CUSTOMER FORM */}

      <section style={styles.formCard}>
        <div style={styles.formHeading}>
          <p style={styles.cardLabel}>
            CUSTOMER DETAILS
          </p>

          <h2 style={styles.formTitle}>
            Account Information
          </h2>
        </div>


        <div style={styles.formGrid}>
          <Field
            label="AOF NO"
            value={form.aofNo}
            onChange={(value) =>
              changeField(
                "aofNo",
                value
              )
            }
          />

          <Field
            label="CUSTOMER ID / ENDROL ID"
            value={form.enrolId}
            required
            onChange={(value) =>
              changeField(
                "enrolId",
                value
              )
            }
          />

          <Field
            label="ACCOUNT NO"
            value={form.accountNo}
            required
            onChange={(value) =>
              changeField(
                "accountNo",
                value
              )
            }
          />

          <Field
            label="NAME"
            value={form.name}
            required
            onChange={(value) =>
              changeField(
                "name",
                value
              )
            }
          />

          <Field
            label="C/O NAME"
            value={form.coName}
            onChange={(value) =>
              changeField(
                "coName",
                value
              )
            }
          />

          <Field
            label="NOMINEE"
            value={form.nominee}
            onChange={(value) =>
              changeField(
                "nominee",
                value
              )
            }
          />

          <SelectField
            label="GENDER"
            value={form.gender}
            onChange={(value) =>
              changeField(
                "gender",
                value
              )
            }
            options={[
              "",
              "Male",
              "Female",
              "Other",
            ]}
          />

          <Field
            label="CONTACT / MOBILE"
            value={form.contact}
            inputMode="numeric"
            onChange={(value) =>
              changeField(
                "contact",
                value
              )
            }
          />

          <SelectField
            label="STATUS"
            value={form.status}
            onChange={(value) =>
              changeField(
                "status",
                value
              )
            }
            options={[
              "",
              "Active",
              "Inactive",
              "Pending",
              "Closed",
            ]}
          />

          <Field
            label="A/C OPENING DATE"
            value={form.accountOpeningDate}
            type="date"
            onChange={(value) =>
              changeField(
                "accountOpeningDate",
                value
              )
            }
          />

          <Field
            label="ADDRESS"
            value={form.address}
            onChange={(value) =>
              changeField(
                "address",
                value
              )
            }
          />

          <Field
            label="POST OFFICE"
            value={form.postOffice}
            onChange={(value) =>
              changeField(
                "postOffice",
                value
              )
            }
          />

          <Field
            label="FULL ADDRESS"
            value={form.fullAddress}
            onChange={(value) =>
              changeField(
                "fullAddress",
                value
              )
            }
          />

          <Field
            label="PIN CODE"
            value={form.pinCode}
            inputMode="numeric"
            onChange={(value) =>
              changeField(
                "pinCode",
                value
              )
            }
          />

          <Field
            label="PAN"
            value={form.pan}
            onChange={(value) =>
              changeField(
                "pan",
                value
              )
            }
          />

          <Field
            label="UIDAI / AADHAAR NO."
            value={form.uidaiNo}
            required
            inputMode="numeric"
            onChange={(value) =>
              changeField(
                "uidaiNo",
                value
              )
            }
          />

          <SelectField
            label="DBT STATUS"
            value={form.dbtStatus}
            onChange={(value) =>
              changeField(
                "dbtStatus",
                value
              )
            }
            options={[
              "",
              "Active",
              "Inactive",
              "Pending",
              "Not Available",
            ]}
          />

          <Field
            label="PURPOSE OF ADVANCE"
            value={form.purposeOfAdvance}
            onChange={(value) =>
              changeField(
                "purposeOfAdvance",
                value
              )
            }
          />

          <SelectField
            label="PASS BOOK STATUS"
            value={form.passbookStatus}
            onChange={(value) =>
              changeField(
                "passbookStatus",
                value
              )
            }
            options={[
              "",
              "Pending",
              "Printed",
              "Delivered",
              "Not Required",
            ]}
          />
        </div>


        {/* ACTION BUTTONS */}

        <div
          className="customer-action-buttons"
          style={styles.formActions}
        >
          {!editMode && (
            <button
              type="button"
              style={styles.saveButton}
              onClick={saveCustomer}
              disabled={saving}
            >
              {saving
                ? "Saving Customer..."
                : "✓ Save Customer"}
            </button>
          )}


          {editMode && (
            <>
              <button
                type="button"
                style={styles.updateButton}
                onClick={updateCustomer}
                disabled={updating}
              >
                {updating
                  ? "Updating..."
                  : "✓ Update Customer"}
              </button>

              <button
                type="button"
                style={styles.deleteButton}
                onClick={openDeleteModal}
              >
                🗑 Delete Customer
              </button>

              <button
                type="button"
                style={styles.cancelEditButton}
                onClick={startNewCustomer}
              >
                ＋ New Customer
              </button>
            </>
          )}
        </div>
      </section>


      {/* DELETE MODAL */}

      {deleteModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.deleteModal}>
            <div style={styles.modalTop}>
              <div>
                <p style={styles.dangerLabel}>
                  ADMINISTRATOR AUTHORIZATION
                </p>

                <h2 style={styles.deleteTitle}>
                  Delete Customer
                </h2>
              </div>

              <button
                type="button"
                style={styles.modalClose}
                onClick={() =>
                  setDeleteModalOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div style={styles.deleteWarning}>
              <strong>
                ⚠ Permanent action
              </strong>

              <span>
                This will delete the customer's Google Sheet
                record and associated Drive photo/PDF where
                available.
              </span>
            </div>

            <div style={styles.deleteCustomerInfo}>
              <strong>
                {form.name ||
                  "Customer"}
              </strong>

              <span>
                Account:{" "}
                {form.accountNo || "-"}
              </span>

              <span>
                Customer ID:{" "}
                {form.enrolId || "-"}
              </span>
            </div>

            <label style={styles.label}>
              Current Administrator Password
            </label>

            <input
              type="password"
              value={deletePassword}
              placeholder="Enter admin password"
              style={styles.input}
              onChange={(event) =>
                setDeletePassword(
                  event.target.value
                )
              }
            />

            <label style={styles.label}>
              Type DELETE CUSTOMER
            </label>

            <input
              type="text"
              value={deleteConfirmText}
              placeholder="DELETE CUSTOMER"
              style={styles.dangerInput}
              onChange={(event) =>
                setDeleteConfirmText(
                  event.target.value
                )
              }
            />

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.finalDeleteButton}
                onClick={deleteCustomer}
                disabled={deleteLoading}
              >
                {deleteLoading
                  ? "Verifying & Deleting..."
                  : "Delete Permanently"}
              </button>

              <button
                type="button"
                style={styles.modalCancelButton}
                onClick={() =>
                  setDeleteModalOpen(false)
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      <style>
        {`
          @media (max-width: 950px) {
            .customer-top-grid {
              grid-template-columns:
                1fr 1fr !important;
            }
          }

          @media (max-width: 760px) {
            .customer-action-buttons {
              flex-direction:
                column !important;
            }

            .customer-action-buttons button {
              width:
                100% !important;
            }
          }
        `}
      </style>
    </div>
  );
}


/* =========================================================
   FIELD
========================================================= */

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  inputMode?:
    | "text"
    | "numeric"
    | "decimal"
    | "tel"
    | "search"
    | "email"
    | "url"
    | "none";
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>
        {label}

        {required && (
          <span style={styles.required}>
            {" "}*
          </span>
        )}
      </span>

      <input
        type={type}
        value={value}
        inputMode={inputMode}
        style={styles.input}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </label>
  );
}


/* =========================================================
   SELECT FIELD
========================================================= */

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>
        {label}
      </span>

      <select
        value={value}
        style={styles.select}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      >
        {options.map((option) => (
          <option
            key={
              option ||
              "__empty"
            }
            value={option}
          >
            {option ||
              "Select"}
          </option>
        ))}
      </select>
    </label>
  );
}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}


/* =========================================================
   STYLES
========================================================= */

const styles: Record<
  string,
  CSSProperties
> = {
  wrapper: {
    width: "100%",
    maxWidth: "1200px",
    margin: "0 auto",
  },

  pageHeading: {
    textAlign: "center",
    marginBottom: "20px",
  },

  eyebrow: {
    margin: 0,
    color: "#42dfc4",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.8px",
  },

  heading: {
    margin: "6px 0",
    color: "#ffffff",
    fontSize: "27px",
  },

  subtitle: {
    margin: 0,
    color: "#91a7b3",
    fontSize: "10px",
  },


  /* MODE */

  modeBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "15px",

    padding: "13px 16px",

    marginBottom: "16px",

    borderRadius: "13px",
  },

  newModeBar: {
    background:
      "rgba(55,220,195,0.055)",

    border:
      "1px solid rgba(55,220,195,0.12)",

    color: "#47e1c7",
  },

  editModeBar: {
    background:
      "rgba(59,153,246,0.07)",

    border:
      "1px solid rgba(59,153,246,0.15)",

    color: "#74b8ff",
  },

  modeDescription: {
    display: "block",
    marginTop: "3px",
    color: "#93a8b3",
    fontSize: "8px",
  },

  newCustomerButton: {
    height: "37px",
    padding: "0 13px",
    borderRadius: "9px",
    border:
      "1px solid rgba(55,220,195,0.16)",
    background:
      "rgba(55,220,195,0.07)",
    color: "#4be1c7",
    cursor: "pointer",
    fontWeight: 700,
  },


  /* TOP GRID */

  topGrid: {
    display: "grid",
    gridTemplateColumns:
      "1.35fr 0.75fr 0.9fr",

    gap: "14px",

    marginBottom: "16px",
  },

  toolCard: {
    minHeight: "180px",

    boxSizing: "border-box",

    padding: "18px",

    borderRadius: "17px",

    border:
      "1px solid rgba(255,255,255,0.06)",

    background:
      "linear-gradient(145deg,#09232e,#0b2a36)",
  },

  photoCard: {
    minHeight: "180px",

    boxSizing: "border-box",

    padding: "14px",

    borderRadius: "17px",

    border:
      "1px solid rgba(55,220,195,0.11)",

    background:
      "linear-gradient(145deg,#092630,#0a303c)",
  },

  cardLabel: {
    margin: 0,
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.4px",
  },

  toolTitle: {
    margin: "6px 0",
    color: "#fff",
    fontSize: "17px",
  },

  toolDescription: {
    minHeight: "28px",
    margin: "0 0 13px",
    color: "#8fa5b1",
    fontSize: "8px",
    lineHeight: 1.5,
  },

  searchRow: {
    display: "flex",
    gap: "8px",
  },

  searchInput: {
    minWidth: 0,
    flex: 1,

    height: "43px",

    padding: "0 12px",

    boxSizing: "border-box",

    borderRadius: "10px",

    border:
      "1px solid rgba(255,255,255,0.07)",

    outline: "none",

    background: "#0a303c",

    color: "#fff",
  },

  searchButton: {
    minWidth: "88px",
    height: "43px",

    border: "none",
    borderRadius: "10px",

    background:
      "linear-gradient(90deg,#34dcbf,#2faade)",

    color: "#032229",

    fontWeight: 800,
    cursor: "pointer",
  },


  /* PHOTO */

  photoArea: {
    height: "105px",

    marginTop: "8px",

    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    overflow: "hidden",

    borderRadius: "12px",

    background: "#071d27",

    border:
      "1px dashed rgba(55,220,195,0.15)",
  },

  photoImage: {
    width: "100%",
    height: "100%",

    objectFit: "contain",
  },

  photoPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",

    color: "#718b98",

    fontSize: "8px",
  },

  photoIcon: {
    fontSize: "28px",
  },

  photoActions: {
    display: "flex",
    gap: "6px",

    marginTop: "8px",
  },

  smallButton: {
    flex: 1,

    minHeight: "33px",

    border: "none",

    borderRadius: "9px",

    background:
      "rgba(55,220,195,0.10)",

    color: "#4be1c7",

    cursor: "pointer",

    fontSize: "8px",
    fontWeight: 700,
  },

  secondarySmallButton: {
    minHeight: "33px",

    padding: "0 9px",

    borderRadius: "9px",

    border:
      "1px solid rgba(255,255,255,0.07)",

    background:
      "rgba(255,255,255,0.035)",

    color: "#b5c4cb",

    cursor: "pointer",

    fontSize: "8px",
  },


  /* PDF */

  pdfButton: {
    width: "100%",
    height: "43px",

    border:
      "1px dashed rgba(55,220,195,0.22)",

    borderRadius: "10px",

    background:
      "rgba(55,220,195,0.045)",

    color: "#48dfc5",

    cursor: "pointer",

    fontWeight: 700,
  },

  pdfName: {
    marginTop: "8px",

    padding: "7px",

    borderRadius: "8px",

    background:
      "rgba(255,255,255,0.03)",

    color: "#9fb1ba",

    fontSize: "8px",

    wordBreak: "break-all",
  },


  /* MESSAGE */

  message: {
    marginBottom: "16px",

    padding: "12px 14px",

    borderRadius: "11px",

    fontSize: "9px",

    lineHeight: 1.5,
  },

  successMessage: {
    background:
      "rgba(55,220,195,0.07)",

    border:
      "1px solid rgba(55,220,195,0.10)",

    color: "#4be2c8",
  },

  errorMessage: {
    background:
      "rgba(255,80,80,0.07)",

    border:
      "1px solid rgba(255,80,80,0.11)",

    color: "#ff9898",
  },

  infoMessage: {
    background:
      "rgba(66,153,225,0.07)",

    border:
      "1px solid rgba(66,153,225,0.11)",

    color: "#8cc5ff",
  },


  /* FORM */

  formCard: {
    padding: "22px",

    borderRadius: "18px",

    background:
      "linear-gradient(145deg,#09232e,#0b2a36)",

    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  formHeading: {
    textAlign: "center",

    marginBottom: "20px",
  },

  formTitle: {
    margin: "6px 0 0",

    color: "#fff",

    fontSize: "19px",
  },

  formGrid: {
    display: "grid",

    gridTemplateColumns:
      "repeat(auto-fit,minmax(220px,1fr))",

    gap: "14px",
  },

  field: {
    minWidth: 0,

    display: "flex",
    flexDirection: "column",

    gap: "6px",
  },

  label: {
    color: "#cddbe2",

    fontSize: "9px",

    fontWeight: 700,
  },

  required: {
    color: "#ff8888",
  },

  input: {
    width: "100%",
    height: "44px",

    boxSizing: "border-box",

    padding: "0 12px",

    outline: "none",

    borderRadius: "10px",

    border:
      "1px solid rgba(255,255,255,0.07)",

    background: "#0a303c",

    color: "#fff",

    fontSize: "10px",
  },

  select: {
    width: "100%",
    height: "44px",

    boxSizing: "border-box",

    padding: "0 12px",

    outline: "none",

    borderRadius: "10px",

    border:
      "1px solid rgba(255,255,255,0.07)",

    background: "#0a303c",

    color: "#fff",

    fontSize: "10px",
  },

  formActions: {
    display: "flex",

    gap: "10px",

    flexWrap: "wrap",

    marginTop: "22px",
  },

  saveButton: {
    minWidth: "180px",
    height: "46px",

    border: "none",

    borderRadius: "11px",

    background:
      "linear-gradient(90deg,#35dcbf,#2eaade)",

    color: "#032329",

    fontWeight: 800,

    cursor: "pointer",
  },

  updateButton: {
    minWidth: "180px",
    height: "46px",

    border: "none",

    borderRadius: "11px",

    background:
      "linear-gradient(90deg,#37dfc3,#35a7f1)",

    color: "#032329",

    fontWeight: 800,

    cursor: "pointer",
  },

  deleteButton: {
    minWidth: "165px",
    height: "46px",

    borderRadius: "11px",

    border:
      "1px solid rgba(255,80,80,0.17)",

    background:
      "rgba(255,80,80,0.055)",

    color: "#ff9494",

    fontWeight: 700,

    cursor: "pointer",
  },

  cancelEditButton: {
    minWidth: "145px",
    height: "46px",

    borderRadius: "11px",

    border:
      "1px solid rgba(255,255,255,0.08)",

    background:
      "rgba(255,255,255,0.035)",

    color: "#c5d4db",

    cursor: "pointer",
  },


  /* DELETE MODAL */

  modalOverlay: {
    position: "fixed",

    inset: 0,

    zIndex: 5000,

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    padding: "20px",

    background:
      "rgba(0,0,0,0.72)",

    backdropFilter:
      "blur(7px)",
  },

  deleteModal: {
    width: "100%",

    maxWidth: "530px",

    boxSizing: "border-box",

    padding: "22px",

    borderRadius: "19px",

    border:
      "1px solid rgba(255,80,80,0.12)",

    background:
      "linear-gradient(145deg,#111d25,#191c24)",

    boxShadow:
      "0 25px 70px rgba(0,0,0,0.55)",
  },

  modalTop: {
    display: "flex",

    justifyContent: "space-between",

    alignItems: "flex-start",

    marginBottom: "16px",
  },

  dangerLabel: {
    margin: 0,

    color: "#ff8585",

    fontSize: "8px",

    fontWeight: 800,

    letterSpacing: "1.3px",
  },

  deleteTitle: {
    margin: "6px 0 0",

    color: "#fff",

    fontSize: "21px",
  },

  modalClose: {
    width: "35px",
    height: "35px",

    border: "none",

    borderRadius: "10px",

    background:
      "rgba(255,255,255,0.05)",

    color: "#fff",

    cursor: "pointer",

    fontSize: "20px",
  },

  deleteWarning: {
    display: "flex",

    flexDirection: "column",

    gap: "5px",

    padding: "13px",

    marginBottom: "14px",

    borderRadius: "11px",

    background:
      "rgba(255,70,70,0.06)",

    border:
      "1px solid rgba(255,70,70,0.10)",

    color: "#ffabab",

    fontSize: "9px",

    lineHeight: 1.5,
  },

  deleteCustomerInfo: {
    display: "flex",

    flexDirection: "column",

    gap: "3px",

    padding: "12px",

    marginBottom: "15px",

    borderRadius: "10px",

    background:
      "rgba(255,255,255,0.035)",

    color: "#aebec6",

    fontSize: "9px",
  },

  dangerInput: {
    width: "100%",
    height: "44px",

    boxSizing: "border-box",

    padding: "0 12px",

    marginTop: "6px",
    marginBottom: "13px",

    outline: "none",

    borderRadius: "10px",

    border:
      "1px solid rgba(255,80,80,0.16)",

    background: "#26191d",

    color: "#fff",
  },

  modalActions: {
    display: "flex",

    gap: "9px",

    marginTop: "5px",
  },

  finalDeleteButton: {
    flex: 1,

    minHeight: "44px",

    border: "none",

    borderRadius: "10px",

    background: "#c83f4c",

    color: "#fff",

    fontWeight: 800,

    cursor: "pointer",
  },

  modalCancelButton: {
    minWidth: "100px",

    minHeight: "44px",

    borderRadius: "10px",

    border:
      "1px solid rgba(255,255,255,0.08)",

    background:
      "rgba(255,255,255,0.04)",

    color: "#c8d5db",

    cursor: "pointer",
  },
};


export default CustomerEntry;