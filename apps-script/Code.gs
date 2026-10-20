// Keep deployment-specific identifiers and Firebase configuration out of the
// public repository. Set these values in Apps Script > Project Settings >
// Script properties for the deployment that owns the legacy workspace.
function getBankSetuScriptProperty(name) {
  return cleanValue(PropertiesService.getScriptProperties().getProperty(name));
}

const LEGACY_SPREADSHEET_ID = getBankSetuScriptProperty("BANKSETU_LEGACY_SPREADSHEET_ID");

const SHEET_NAME = "Sheet1";
const AUDIT_SHEET_NAME = "BankSetuAudit";
const AUDIT_HEADERS = [
  "EVENT ID", "TIMESTAMP", "TENANT ID", "ACTOR UID", "ACTOR EMAIL",
  "ACTOR NAME", "ACTION", "CUSTOMER ID", "ACCOUNT NO", "CUSTOMER NAME", "DETAILS"
];

const CUSTOMER_PHOTO_FOLDER_ID = getBankSetuScriptProperty("BANKSETU_LEGACY_PHOTO_FOLDER_ID");

const FIREBASE_PROJECT_ID =
  "banksetu-69e2f";

// Firebase Web API keys identify the project and are safe to use in this
// token-verification request; the ID token remains mandatory.
const FIREBASE_API_KEY =
  getBankSetuScriptProperty("BANKSETU_FIREBASE_API_KEY") ||
  "AIzaSyDjm01ZjY9sHVtMLI9J2OG7HqR-w9lVnLo";

const MAX_PHOTO_SIZE =
  5 * 1024 * 1024;

const HEADERS = [
  "ENDROL ID",
  "ACCOUNT NO",
  "NAME",
  "C/O NAME",
  "STATUSTUS",
  "GENDER",
  "CONTACT",
  "A/C OPENING DATE",
  "ADDRESS",
  "NOMENIEE",
  "POST OFFICE",
  "PASS BOOK",
  "UIADI NO.",
  "dbt status",
  "PURPOSE OF ADVANCE",
  "FULL ADDRESS",
  "PIN CODE",
  "PAN",
  "AOF NO",
  "PHOTO URL",
  "PDF URL",
  "CREATED AT",
  "UPDATED AT",
  "UPDATED BY"
];


/* =========================================================
   HEALTH CHECK
========================================================= */

function doGet(e) {
  try {
    const action =
      cleanValue(
        e &&
        e.parameter &&
        e.parameter.action
      ) || "status";

    if (action === "status") {
      return jsonResponse({
        success: true,
        protected: true,
        message:
          "Bank Setu API is running",
        masterLocalSyncVersion: !getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") ? "master-v1" : "",
        masterConnectionId: !getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") ? masterLocalConnectionId() : "",
        tenantIsolationVersion: getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") ? "v3" : "v2",
        licenseEnforcementVersion: 2,
        syncProtectionVersion: 1,
        afsmVersion: 1,
        photoIndexVersion: 1,
        tenantId: getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID"),
        spreadsheetId: getBankSetuScriptProperty("BANKSETU_CLIENT_SPREADSHEET_ID"),
        photoFolderId: getBankSetuScriptProperty("BANKSETU_CLIENT_FOLDER_ID"),
        ownerEmail: getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") ? Session.getEffectiveUser().getEmail() : ""
      });
    }

    return jsonResponse({
      success: false,
      message:
        "Protected API. Authentication required."
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      message:
        getErrorMessage(error)
    });
  }
}


/* =========================================================
   POST API
========================================================= */

function doPost(e) {
  try {
    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {
      return jsonResponse({
        success: false,
        message:
          "No request data received."
      });
    }

    const request =
      JSON.parse(
        e.postData.contents
      );

    const action =
      cleanValue(
        request.action
      );

    const idToken =
      cleanValue(
        request.idToken
      );

    if (!idToken) {
      return jsonResponse({
        success: false,
        code:
          "AUTH_REQUIRED",
        message:
          "Firebase authentication is required."
      });
    }

    if (["getPhotoPresence", "syncCustomerOperation", "getSyncProtection", "getCustomerChanges", "publishLocalReset", "getCustomerPage", "getAllCustomers", "getCustomerByRowNumber", "markPassbookPrinted"].includes(action) || (action === "searchCustomer" && (getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") || request.masterLocalSync === true))) {
      const authUser = requireAuthorizedUser(idToken, false, action);
      if (action === "getPhotoPresence") return getPhotoPresence(request,authUser);
      if (action === "syncCustomerOperation") return syncCustomerOperation(request, authUser);
      if (action === "getSyncProtection" || action === "publishLocalReset") return syncProtection(request, authUser);
      if (action === "getCustomerChanges") return getCustomerChanges(request, authUser);
      if (action === "markPassbookPrinted") {
        if (authUser.tenantId && authUser.connectionId) return jsonResponse({success:false,code:"SYNC_REQUIRED",message:"Use the stable-ID sync operation for this workspace."});
        return markPassbookDelivered(request.rowNumber, authUser);
      }
      return localFirstRead(request, authUser);
    }

    if (action === "uploadBankFormatSample") {
      const admin = requireAuthorizedUser(idToken, true, action);
      if (admin.role !== "client_admin") throw new Error("Client Admin permission is required.");
      return jsonResponse(Object.assign({success:true}, saveBoundDocument(request.dataUrl, request.fileName, admin.photoFolderId, request.operationId)));
    }

    if (["saveCustomer","updateCustomer","deleteCustomer","markPassbookDelivered"].includes(action)) {
      const checked = requireAuthorizedUser(idToken, false, action);
      if (checked.tenantId && checked.connectionId) return jsonResponse({success:false,code:"SYNC_REQUIRED",message:"Use the stable-ID sync operation for this workspace."});
    }

    if (action === "getRecentActivities") {
      const authUser = requireAuthorizedUser(idToken, false, action);
      return getRecentActivities(authUser, request.limit);
    }

    if (action === "getDashboardStats") {
      const authUser = requireAuthorizedUser(idToken, false, action);
      return getDashboardStats(authUser);
    }

    if (action === "getBankFormatPreview") {
      const authUser = requireAuthorizedUser(idToken, false, action);
      return getBankFormatPreview(authUser, request.formatType);
    }

    if (action === "testTenantConnection") {
      const authUser = requireAuthorizedUser(idToken, false, action);
      return testTenantConnection(authUser);
    }


    if (
      action === "saveCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(idToken, false, action);

      return saveCustomer(
        request.customer || {},
        authUser
      );
    }


    if (
      action === "searchCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(idToken, false, action);

      return searchCustomer(
        request.query,
        authUser
      );
    }


    if (
      action === "updateCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(idToken, false, action);

      return updateCustomer(
        request.rowNumber,
        request.customer || {},
        authUser
      );
    }


    if (
      action === "checkDuplicate"
    ) {
      const authUser = requireAuthorizedUser(idToken, false, action);

      return checkDuplicate(
        request.customer || {},
        request.excludeRowNumber,
        authUser
      );
    }


    if (
      action ===
      "markPassbookDelivered"
    ) {
      const authUser =
        requireAuthorizedUser(idToken, false, action);

      return markPassbookDelivered(
        request.rowNumber,
        authUser
      );
    }


    if (
      action === "deleteCustomer"
    ) {
      const admin =
        requireAuthorizedUser(idToken, true, action);

      return deleteCustomer(
        request.rowNumber,
        admin
      );
    }


    return jsonResponse({
      success: false,
      code:
        "INVALID_ACTION",
      message:
        "Invalid action."
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      code:
        "SERVER_ERROR",
      message:
        getErrorMessage(error)
    });
  }
}


/* =========================================================
   FIREBASE AUTHORIZATION
========================================================= */

function requireAuthorizedUser(
  idToken,
  adminRequired,
  action
) {
  const authAccount =
    verifyFirebaseIdToken(
      idToken
    );

  const uid =
    cleanValue(
      authAccount.localId
    );

  if (!uid) {
    throw new Error(
      "Firebase user could not be verified."
    );
  }

  const profile =
    getFirestoreUserProfile(
      uid,
      idToken
    );

  const role =
    cleanValue(
      profile.role
    ).toLowerCase();

  const status =
    cleanValue(
      profile.status
    ).toLowerCase();

  const subscriptionStatus =
    cleanValue(
      profile.subscriptionStatus
    ).toLowerCase();


  if (
    status !== "approved"
  ) {
    throw new Error(
      "Your Bank Setu account is not approved."
    );
  }


  if (
    subscriptionStatus !== "active"
  ) {
    throw new Error(
      "Your Bank Setu subscription is inactive."
    );
  }


  if (![
    "admin",
    "master_owner",
    "client_admin",
    "client_user",
    "user"
  ].includes(role)) {
    throw new Error("Your Bank Setu account role is not supported.");
  }

  if (
    adminRequired &&
    !["admin", "master_owner", "client_admin"].includes(role)
  ) {
    throw new Error(
      "Administrator permission is required."
    );
  }


  const tenantId = cleanValue(profile.tenantId);
  // The legacy Master Sheet is restricted to legacy/master administrators.
  // A non-tenant user must fail closed; never fall back to Master data.
  if (
    !tenantId && role === "admin" &&
    (cleanValue(authAccount.email).toLowerCase() !== "banksetu2026@gmail.com" ||
      authAccount.emailVerified !== true)
  ) {
    throw new Error("This legacy administrator is not the verified Master Admin account.");
  }
  if (!tenantId && !["admin", "master_owner"].includes(role)) {
    throw new Error("This account is not assigned to an operational workspace.");
  }
  if (tenantId && !["client_admin", "client_user"].includes(role)) {
    throw new Error("Only a client account assigned to this workspace may access its data.");
  }
  if (tenantId && [
    "saveCustomer", "updateCustomer", "deleteCustomer", "markPassbookDelivered",
    "markPassbookPrinted", "uploadBankFormatSample", "getBankFormatPreview", "publishLocalReset",
    "syncCustomerOperation"
  ].indexOf(action) !== -1) {
    const license = getFirestoreTenantLicense(tenantId, idToken);
    if (!license || license.tenantId !== tenantId || !licenseAllowsWrite(license)) {
      throw new Error("License renewal is required. Pending customer changes remain saved locally.");
    }
  }
  const tenantSettings = tenantId
    ? getFirestoreTenantSettings(tenantId, idToken)
    : null;
  if (tenantId) {
    const tenant = getFirestoreTenant(tenantId, idToken);
    if (tenant.status !== "active") {
      throw new Error("This client workspace is blocked or unavailable.");
    }
    if (!tenantSettings || !tenant.ownerUid || tenantSettings.workspaceOwnerUid !== tenant.ownerUid) {
      throw new Error("This workspace has not verified its private Google Sheet. Connect its own Google account first.");
    }
  }
  const spreadsheetId = tenantId
    ? cleanValue(tenantSettings && tenantSettings.spreadsheetId)
    : LEGACY_SPREADSHEET_ID;
  const photoFolderId = tenantId
    ? cleanValue(tenantSettings && tenantSettings.photoFolderId)
    : CUSTOMER_PHOTO_FOLDER_ID;

  if (!tenantId && (!spreadsheetId || !photoFolderId)) {
    throw new Error("The legacy workspace is not configured. Ask the Bank Setu owner to finish the Apps Script configuration.");
  }

  if (tenantId && (!spreadsheetId || !photoFolderId)) {
    throw new Error("This client workspace data connection is not configured yet.");
  }
  if (tenantId && LEGACY_SPREADSHEET_ID && spreadsheetId === LEGACY_SPREADSHEET_ID) {
    throw new Error("Client workspaces cannot use the Master Admin spreadsheet.");
  }

  const clientTenant = getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID");
  if (clientTenant && (tenantId !== clientTenant || spreadsheetId !== getBankSetuScriptProperty("BANKSETU_CLIENT_SPREADSHEET_ID") || photoFolderId !== getBankSetuScriptProperty("BANKSETU_CLIENT_FOLDER_ID"))) {
    throw new Error("This client-owned bridge cannot access a different workspace.");
  }
  return {
    connectionId: tenantSettings ? tenantSettings.connectionId : masterLocalConnectionId(),
    uid,
    email:
      cleanValue(
        authAccount.email ||
        profile.email
      ),
    role,
    status,
    subscriptionStatus,
    tenantId,
    spreadsheetId,
    photoFolderId,
    bankFormats: tenantSettings ? tenantSettings.bankFormats : {},
    idToken
  };
}


/* =========================================================
   FIREBASE TOKEN VERIFY
========================================================= */

function verifyFirebaseIdToken(
  idToken
) {
  if (!FIREBASE_API_KEY) {
    throw new Error("Firebase authentication is not configured for this Apps Script deployment.");
  }
  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
    encodeURIComponent(
      FIREBASE_API_KEY
    );

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: "post",
        contentType:
          "application/json",

        payload:
          JSON.stringify({
            idToken:
              idToken
          }),

        muteHttpExceptions:
          true
      }
    );

  const code =
    response.getResponseCode();

  const body =
    JSON.parse(
      response.getContentText() ||
      "{}"
    );


  if (
    code !== 200 ||
    !body.users ||
    !body.users.length
  ) {
    throw new Error(
      "Firebase login session is invalid or expired."
    );
  }


  return body.users[0];
}


/* =========================================================
   FIRESTORE USER PROFILE
========================================================= */

function getFirestoreUserProfile(
  uid,
  idToken
) {
  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(
      FIREBASE_PROJECT_ID
    ) +
    "/databases/(default)/documents/users/" +
    encodeURIComponent(
      uid
    );

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method:
          "get",

        headers: {
          Authorization:
            "Bearer " +
            idToken
        },

        muteHttpExceptions:
          true
      }
    );


  if (
    response.getResponseCode() !==
    200
  ) {
    throw new Error(
      "Bank Setu user profile permission denied."
    );
  }


  const document =
    JSON.parse(
      response.getContentText() ||
      "{}"
    );


  return {
    role:
      firestoreString(
        document,
        "role"
      ),

    status:
      firestoreString(
        document,
        "status"
      ),

    subscriptionStatus:
      firestoreString(
        document,
        "subscriptionStatus"
      ),

    name:
      firestoreString(
        document,
        "name"
      ),

    email:
      firestoreString(
        document,
        "email"
      ),
    tenantId:
      firestoreString(
        document,
        "tenantId"
      ),
    licenseRequired: Boolean(document.fields && document.fields.licenseRequired && document.fields.licenseRequired.booleanValue === true)
  };
}


function getFirestoreTenantLicense(tenantId, idToken) {
  const url = "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents/tenantLicenses/" + encodeURIComponent(tenantId);
  const response = UrlFetchApp.fetch(url, { method: "get", headers: { Authorization: "Bearer " + idToken }, muteHttpExceptions: true });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) throw new Error("License verification is temporarily unavailable. Local changes remain saved.");
  const document = JSON.parse(response.getContentText() || "{}");
  return {
    tenantId: firestoreString(document, "tenantId"),
    plan: firestoreString(document, "plan"),
    status: firestoreString(document, "status"),
    activatedAt: firestoreString(document, "activatedAt"),
    expiresAt: firestoreString(document, "expiresAt"),
    graceDays: Number(document.fields && document.fields.graceDays && document.fields.graceDays.integerValue || 7)
  };
}

function licenseAllowsWrite(license) {
  if (!license || (license.status !== "active" && license.status !== "scheduled")) return false;
  const startsAt = Date.parse(license.activatedAt);
  if (license.status === "scheduled" && !Number.isFinite(startsAt)) return false;
  if (Number.isFinite(startsAt) && Date.now() < startsAt) return false;
  if (license.plan === "lifetime") return true;
  if (license.plan !== "annual") return false;
  const expiry = Date.parse(license.expiresAt);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

function getFirestoreTenantSettings(tenantId, idToken) {
  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents/tenantSettings/" +
    encodeURIComponent(tenantId);
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + idToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error("Your client workspace settings could not be verified.");
  }
  const document = JSON.parse(response.getContentText() || "{}");
  return {
    spreadsheetId: firestoreString(document, "spreadsheetId"),
    photoFolderId: firestoreString(document, "photoFolderId"),
    workspaceOwnerUid: firestoreString(document, "workspaceOwnerUid"),
    connectionId: firestoreString(document, "connectionId"),
    bankFormats: firestoreBankFormats(document)
  };
}


function getFirestoreTenant(tenantId, idToken) {
  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents/tenants/" +
    encodeURIComponent(tenantId);
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + idToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error("Your client workspace could not be verified.");
  }
  const document = JSON.parse(response.getContentText() || "{}");
  return {
    status: firestoreString(document, "status").toLowerCase(),
    ownerUid: firestoreString(document, "ownerUid")
  };
}


function firestoreBankFormats(document) {
  try {
    const formats = document.fields.bankFormats.mapValue.fields || {};
    const output = {};
    Object.keys(formats).forEach(function (formatType) {
      const fields = formats[formatType].mapValue.fields || {};
      output[formatType] = {
        fileId: fields.fileId && fields.fileId.stringValue || "",
        fileName: fields.fileName && fields.fileName.stringValue || "",
        mimeType: fields.mimeType && fields.mimeType.stringValue || ""
      };
    });
    return output;
  } catch (error) {
    return {};
  }
}


function getBankFormatPreview(authUser, formatType) {
  const allowedTypes = ["passbook", "quickPassbook", "accountOpening"];
  const normalizedType = cleanValue(formatType);
  if (allowedTypes.indexOf(normalizedType) === -1) {
    throw new Error("Choose a valid bank format sample.");
  }
  const sample = authUser.bankFormats && authUser.bankFormats[normalizedType];
  const fileId = cleanValue(sample && sample.fileId);
  if (!fileId) throw new Error("No sample has been uploaded for this bank format yet.");
  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  let belongsToWorkspace = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === authUser.photoFolderId) {
      belongsToWorkspace = true;
      break;
    }
  }
  if (!belongsToWorkspace) throw new Error("This sample is outside the current client workspace.");
  if (file.getSize() > MAX_PHOTO_SIZE) throw new Error("This format sample exceeds the 5 MB preview limit.");
  const blob = file.getBlob();
  return jsonResponse({
    success: true,
    formatType: normalizedType,
    fileName: file.getName(),
    mimeType: blob.getContentType() || cleanValue(sample.mimeType),
    data: Utilities.base64Encode(blob.getBytes())
  });
}


function testTenantConnection(authUser) {
  if (!authUser.tenantId || !authUser.spreadsheetId || !authUser.photoFolderId) {
    throw new Error("This account does not have a complete client workspace connection.");
  }
  const spreadsheet = SpreadsheetApp.openById(authUser.spreadsheetId);
  const customerSheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!customerSheet) throw new Error("The connected Google Sheet is missing its Sheet1 tab.");
  const folder = DriveApp.getFolderById(authUser.photoFolderId);
  return jsonResponse({
    success: true,
    tenantId: authUser.tenantId,
    spreadsheetName: spreadsheet.getName(),
    photoFolderName: folder.getName(),
    customerTab: customerSheet.getName()
  });
}


function firestoreString(
  document,
  field
) {
  try {
    const value =
      document.fields[field];

    if (
      value &&
      value.stringValue !==
      undefined
    ) {
      return String(
        value.stringValue
      );
    }

    return "";

  } catch (error) {
    return "";
  }
}


/* =========================================================
   SAVE CUSTOMER
========================================================= */

function saveCustomer(
  customer,
  authUser
) {
  const name =
    cleanValue(
      customer.name
    );

  const accountNo =
    cleanValue(
      customer.accountNo
    );

  const enrolId =
    cleanValue(
      customer.enrolId
    );

  const uidaiNo =
    normalizeDigits(
      customer.uidaiNo
    );


  if (!name) {
    return jsonResponse({
      success: false,
      message:
        "Customer Name is required."
    });
  }


  if (!accountNo) {
    return jsonResponse({
      success: false,
      message:
        "Account Number is required."
    });
  }


  if (!enrolId) {
    return jsonResponse({
      success: false,
      message:
        "Customer ID / ENDROL ID is required."
    });
  }


  if (
    uidaiNo.length !== 12
  ) {
    return jsonResponse({
      success: false,
      message:
        "UIDAI / Aadhaar Number must contain exactly 12 digits."
    });
  }


  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    20000
  );


  let uploadedPhoto =
    null;


  try {
    const duplicate =
      findDuplicates(
        {
          accountNo,
          enrolId,
          uidaiNo
        },
        null,
        authUser
      );


    const duplicateResponse =
      duplicateErrorResponse(
        duplicate
      );


    if (
      duplicateResponse
    ) {
      return duplicateResponse;
    }


    /*
      PHOTO:
      Customer ID filename.
    */

    if (
      customer.photoDataUrl
    ) {
      uploadedPhoto =
        savePhotoByCustomerId(
          customer.photoDataUrl,
          enrolId,
          authUser.photoFolderId
        );
    }


    /*
      अगर नया photo upload नहीं किया,
      लेकिन folder में पहले से Customer ID
      वाला backup photo है, उसे detect करेंगे.
    */

    if (!uploadedPhoto) {
      uploadedPhoto =
        findPhotoByCustomerId(
          enrolId,
          authUser.photoFolderId
        );
    }


    const now =
      new Date();


    const customerForSheet = {
      ...customer,

      uidaiNo,

      photoUrl:
        uploadedPhoto
          ? uploadedPhoto.driveUrl
          : "",

      updatedBy:
        authUser.email
    };


    const sheet =
      getSheet(authUser);


    sheet.appendRow(
      customerToRow(
        customerForSheet,
        now,
        now
      )
    );

    recordActivity(authUser, "CREATE", customerForSheet, "Customer record created.");


    return jsonResponse({
      success: true,

      message:
        uploadedPhoto
          ? "Customer saved and Customer ID photo linked successfully."
          : "Customer saved successfully. No Customer ID photo was found.",

      rowNumber:
        sheet.getLastRow(),

      photo:
        uploadedPhoto
    });

  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   UPDATE CUSTOMER
========================================================= */

function updateCustomer(
  rowNumber,
  customer,
  authUser
) {
  const row =
    Number(
      rowNumber
    );

  const sheet =
    getSheet(authUser);


  if (
    !row ||
    row < 2 ||
    row > sheet.getLastRow()
  ) {
    return jsonResponse({
      success: false,
      message:
        "Customer record was not found."
    });
  }


  const existingRow =
    sheet
      .getRange(
        row,
        1,
        1,
        HEADERS.length
      )
      .getValues()[0];


  const oldEnrolId =
    cleanValue(
      existingRow[0]
    );


  const enrolId =
    cleanValue(
      customer.enrolId
    );

  const accountNo =
    cleanValue(
      customer.accountNo
    );

  const uidaiNo =
    normalizeDigits(
      customer.uidaiNo
    );


  if (!enrolId) {
    return jsonResponse({
      success: false,
      message:
        "Customer ID / ENDROL ID is required."
    });
  }


  if (
    uidaiNo.length !== 12
  ) {
    return jsonResponse({
      success: false,
      message:
        "UIDAI / Aadhaar Number must contain exactly 12 digits."
    });
  }


  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    20000
  );


  try {
    const duplicate =
        findDuplicates(
        {
          accountNo,
          enrolId,
          uidaiNo
        },
        row,
        authUser
      );


    const duplicateResponse =
      duplicateErrorResponse(
        duplicate
      );


    if (
      duplicateResponse
    ) {
      return duplicateResponse;
    }


    let photo =
      null;


    /*
      NEW PHOTO SELECTED:
      Save directly using current Customer ID.
    */

    if (
      customer.photoDataUrl
    ) {
      photo =
        savePhotoByCustomerId(
          customer.photoDataUrl,
          enrolId,
          authUser.photoFolderId
        );
    }


    /*
      अगर नया photo नहीं चुना गया
      और Customer ID बदल गई है,
      पुराने ID वाली photo को new ID
      में rename करने की कोशिश करेंगे.
    */

    if (
      !photo &&
      oldEnrolId &&
      enrolId &&
      normalizeIdentifier(
        oldEnrolId
      ) !==
      normalizeIdentifier(
        enrolId
      )
    ) {
      photo =
        renamePhotoCustomerId(
          oldEnrolId,
          enrolId,
          authUser.photoFolderId
        );
    }


    /*
      फिर current Customer ID से
      folder lookup.
    */

    if (!photo && !cleanValue(existingRow[19])) {
      photo =
        findPhotoByCustomerId(
          enrolId,
          authUser.photoFolderId
        );
    }


    /*
      अगर अभी भी नहीं मिला,
      existing PHOTO URL रख सकते हैं.
    */

    const existingPhotoUrl =
      cleanValue(
        existingRow[19]
      );


    const finalPhotoUrl =
      photo
        ? photo.driveUrl
        : existingPhotoUrl;


    const existingPdfUrl =
      cleanValue(
        existingRow[20]
      );


    const createdAt =
      existingRow[21] ||
      new Date();


    const updatedCustomer = {
      ...customer,

      uidaiNo,

      photoUrl:
        finalPhotoUrl,

      pdfUrl:
        cleanValue(
          customer.pdfUrl
        ) ||
        existingPdfUrl,

      updatedBy:
        authUser.email
    };


    sheet
      .getRange(
        row,
        1,
        1,
        HEADERS.length
      )
      .setValues([
        customerToRow(
          updatedCustomer,
          createdAt,
          new Date()
        )
      ]);

    recordActivity(authUser, "UPDATE", updatedCustomer, activityChanges(rowToCustomer(existingRow), updatedCustomer));


    return jsonResponse({
      success: true,
      message:
        "Customer updated successfully.",
      rowNumber:
        row,
      photo:
        photo
    });

  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   SEARCH CUSTOMER
========================================================= */

function searchCustomer(
  query,
  authUser
) {
  const searchValue =
    cleanValue(
      query
    );


  if (!searchValue) {
    return jsonResponse({
      success: false,
      message:
        "Search value is required."
    });
  }


  const sheet =
    getSheet(authUser);

  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {
    return jsonResponse({
      success: false,
      message:
        "No customer data found."
    });
  }


  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        HEADERS.length
      )
      .getDisplayValues();


  const normalSearch =
    normalize(
      searchValue
    );

  const digitSearch =
    normalizeDigits(
      searchValue
    );


  for (
    let i = 0;
    i < values.length;
    i++
  ) {
    const row =
      values[i];


    const found =
      normalize(row[0]).includes(
        normalSearch
      ) ||

      normalize(row[1]).includes(
        normalSearch
      ) ||

      normalize(row[2]).includes(
        normalSearch
      ) ||

      normalize(row[17]).includes(
        normalSearch
      ) ||

      normalize(row[18]).includes(
        normalSearch
      ) ||

      (
        digitSearch &&
        normalizeDigits(
          row[6]
        ).includes(
          digitSearch
        )
      ) ||

      (
        digitSearch &&
        normalizeDigits(
          row[12]
        ).includes(
          digitSearch
        )
      );


    if (found) {
      const customer =
        rowToCustomer(
          row
        );


      /*
        MAIN RULE:
        Photo always Customer ID से खोजेंगे.
      */

      const customerId =
        cleanValue(
          customer.enrolId
        );


      const drivePhoto =
        findPhotoByCustomerId(
          customerId,
          authUser.photoFolderId
        );


      if (drivePhoto) {
        customer.photoUrl =
          drivePhoto.driveUrl;

        customer.photoPreview =
          getPhotoPreviewFromFileId(
            drivePhoto.fileId, authUser.photoFolderId
          );
      } else {
        /*
          पुराने records में अगर केवल PHOTO URL है
          तो fallback.
        */

        customer.photoPreview =
          getPhotoPreviewDataUrl(
            customer.photoUrl, authUser.photoFolderId
          );
      }


      customer.passbookDisplay =
        getPassbookDisplay(
          customer.passbookStatus
        );


      return jsonResponse({
        success: true,
        message:
          "Customer found.",
        rowNumber:
          i + 2,
        customer:
          customer
      });
    }
  }


  return jsonResponse({
    success: false,
    message:
      "Customer not found."
  });
}


/* =========================================================
   CUSTOMER ID PHOTO SAVE
========================================================= */

function savePhotoByCustomerId(
  dataUrl,
  customerId,
  photoFolderId
) {
  const safeCustomerId =
    safeFileName(
      customerId
    );


  if (!safeCustomerId) {
    throw new Error(
      "Customer ID is required before uploading photo."
    );
  }


  const parsed =
    parseImageDataUrl(
      dataUrl
    );


  if (!parsed) {
    throw new Error(
      "Invalid customer photo."
    );
  }


  if (
    parsed.bytes.length >
    MAX_PHOTO_SIZE
  ) {
    throw new Error(
      "Customer photo must be smaller than 5 MB."
    );
  }


  const extension =
    getImageExtension(
      parsed.mimeType
    );


  // Keep the prior file until the new photo and its Sheet reference are saved.
  // A failed upload or Sheet write must never destroy the active photo.


  const fileName =
    safeCustomerId +
    "." +
    extension;


  const blob =
    Utilities.newBlob(
      parsed.bytes,
      parsed.mimeType,
      fileName
    );


  const folder =
    DriveApp.getFolderById(
      photoFolderId
    );


  const file =
    folder.createFile(
      blob
    );


  return drivePhotoObject(
    file
  );
}


/* =========================================================
   FIND PHOTO USING CUSTOMER ID
========================================================= */

function findPhotoByCustomerId(
  customerId,
  photoFolderId
) {
  const safeId =
    safeFileName(
      customerId
    );


  if (!safeId) {
    return null;
  }


  const folder =
    DriveApp.getFolderById(
      photoFolderId
    );


  /*
    पुराने backup में uppercase/lowercase
    extension अलग हो सकती है.
  */

  const possibleNames = [
    safeId + ".jpg",
    safeId + ".jpeg",
    safeId + ".png",
    safeId + ".webp",

    safeId + ".JPG",
    safeId + ".JPEG",
    safeId + ".PNG",
    safeId + ".WEBP"
  ];


  for (
    let i = 0;
    i < possibleNames.length;
    i++
  ) {
    const files =
      folder.getFilesByName(
        possibleNames[i]
      );


    if (
      files.hasNext()
    ) {
      return drivePhotoObject(
        files.next()
      );
    }
  }


  return null;
}


/* =========================================================
   RENAME OLD CUSTOMER ID PHOTO
========================================================= */

function renamePhotoCustomerId(
  oldCustomerId,
  newCustomerId,
  photoFolderId
) {
  const oldPhoto =
    findPhotoByCustomerId(
      oldCustomerId,
      photoFolderId
    );


  if (!oldPhoto) {
    return null;
  }


  /*
    अगर new ID के नाम से पहले से photo
    मौजूद है तो उसे पहले trash करेंगे.
  */

  deletePhotosByCustomerId(newCustomerId, photoFolderId);


  const file =
    DriveApp.getFileById(
      oldPhoto.fileId
    );


  const oldName =
    file.getName();


  const extension =
    oldName.indexOf(".") >= 0
      ? oldName
          .split(".")
          .pop()
          .toLowerCase()
      : "jpg";


  file.setName(
    safeFileName(
      newCustomerId
    ) +
    "." +
    extension
  );


  return drivePhotoObject(
    file
  );
}


/* =========================================================
   DELETE ALL PHOTO FILES FOR CUSTOMER ID
========================================================= */

function deletePhotosByCustomerId(
  customerId,
  photoFolderId
) {
  const safeId =
    safeFileName(
      customerId
    );


  if (!safeId) {
    return;
  }


  const folder =
    DriveApp.getFolderById(
      photoFolderId
    );


  const names = [
    safeId + ".jpg",
    safeId + ".jpeg",
    safeId + ".png",
    safeId + ".webp",

    safeId + ".JPG",
    safeId + ".JPEG",
    safeId + ".PNG",
    safeId + ".WEBP"
  ];


  names.forEach(
    function (name) {
      const files =
        folder.getFilesByName(
          name
        );


      while (
        files.hasNext()
      ) {
        try {
          files
            .next()
            .setTrashed(
              true
            );
        } catch (error) {
          console.error(
            error
          );
        }
      }
    }
  );
}


/* =========================================================
   DRIVE PHOTO OBJECT
========================================================= */

function drivePhotoObject(
  file
) {
  const fileId =
    file.getId();


  return {
    fileId:
      fileId,

    fileName:
      file.getName(),

    driveUrl:
      "https://drive.google.com/file/d/" +
      fileId +
      "/view"
  };
}


/* =========================================================
   PHOTO PREVIEW FROM FILE ID
========================================================= */

function getPhotoPreviewFromFileId(
  fileId, allowedFolderId
) {
  try {
    if (!fileId) {
      return "";
    }


    const file = DriveApp.getFileById(fileId);
    if (!allowedFolderId || !fileBelongsToFolder(file, allowedFolderId)) return "";
    const blob = file.getBlob();


    const mimeType =
      blob.getContentType();


    if (
      !mimeType ||
      !mimeType.startsWith(
        "image/"
      )
    ) {
      return "";
    }


    const bytes =
      blob.getBytes();


    if (
      bytes.length >
      MAX_PHOTO_SIZE
    ) {
      return "";
    }


    return (
      "data:" +
      mimeType +
      ";base64," +
      Utilities.base64Encode(
        bytes
      )
    );

  } catch (error) {
    return "";
  }
}


/* =========================================================
   OLD PHOTO URL FALLBACK
========================================================= */

function getPhotoPreviewDataUrl(
  photoUrl, allowedFolderId
) {
  const fileId =
    extractDriveFileId(
      photoUrl
    );


  if (!fileId) {
    return "";
  }


  return getPhotoPreviewFromFileId(
    fileId, allowedFolderId
  );
}


/* =========================================================
   DELETE CUSTOMER - ADMIN
========================================================= */

function deleteCustomer(
  rowNumber,
  admin
) {
  if (
    !admin ||
    !["admin", "master_owner", "client_admin"].includes(admin.role)
  ) {
    return jsonResponse({
      success: false,
      message:
        "Administrator permission is required."
    });
  }


  const row =
    Number(
      rowNumber
    );

  const sheet =
    getSheet(admin);


  if (
    !row ||
    row < 2 ||
    row > sheet.getLastRow()
  ) {
    return jsonResponse({
      success: false,
      message:
        "Customer record was not found."
    });
  }


  const existing =
    sheet
      .getRange(
        row,
        1,
        1,
        HEADERS.length
      )
      .getDisplayValues()[0];


  const customerId =
    cleanValue(
      existing[0]
    );

  const customerName =
    cleanValue(
      existing[2]
    );

  const pdfUrl =
    cleanValue(
      existing[20]
    );


  sheet.deleteRow(
    row
  );

  recordActivity(admin, "DELETE", {
    enrolId: customerId,
    accountNo: existing[1],
    name: customerName,
  }, "Customer record deleted.");


  /*
    Customer ID based photo delete.
  */

  deletePhotosByCustomerId(customerId, admin.photoFolderId);


  /*
    PDF cleanup अभी पुरानी URL method से.
  */

  const pdfId =
    extractDriveFileId(
      pdfUrl
    );


  if (pdfId) {
    safeTrashDriveFile(
      pdfId, admin.photoFolderId
    );
  }


  return jsonResponse({
    success: true,
    message:
      customerName
        ? customerName +
          " deleted successfully."
        : "Customer deleted successfully."
  });
}


/* =========================================================
   PASSBOOK DELIVERED
========================================================= */

function markPassbookDelivered(
  rowNumber,
  authUser
) {
  const row =
    Number(
      rowNumber
    );

  const sheet =
    getSheet(authUser);


  if (
    !row ||
    row < 2 ||
    row > sheet.getLastRow()
  ) {
    return jsonResponse({
      success: false,
      message:
        "Customer record was not found."
    });
  }


  sheet
    .getRange(
      row,
      12
    )
    .setValue(
      "Delivered"
    );


  sheet
    .getRange(
      row,
      23
    )
    .setValue(
      new Date()
    );


  sheet
    .getRange(
      row,
      24
    )
    .setValue(
      authUser.email
    );

  const deliveredCustomer = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  recordActivity(authUser, "PASSBOOK_DELIVERED", {
    enrolId: deliveredCustomer[0],
    accountNo: deliveredCustomer[1],
    name: deliveredCustomer[2],
  }, "Passbook marked as delivered.");


  return jsonResponse({
    success: true,
    message:
      "Passbook marked as Delivered.",
    passbookStatus:
      "Delivered"
  });
}


/* =========================================================
   PASSBOOK DISPLAY
========================================================= */

function getPassbookDisplay(
  value
) {
  const status =
    cleanValue(
      value
    ).toLowerCase();


  if (
    status === "delivered"
  ) {
    return {
      code:
        "DELIVERED",
      label:
        "Passbook Delivered"
    };
  }


  return {
    code:
      "PENDING",
    label:
      "Passbook देना है"
  };
}


/* =========================================================
   DUPLICATE CHECK
========================================================= */

function checkDuplicate(
  customer,
  excludeRowNumber,
  authUser
) {
  const duplicate =
    findDuplicates(
      customer,
      Number(
        excludeRowNumber
      ) || null,
      authUser
    );


  return jsonResponse({
    success: true,

    duplicate:
      !!(
        duplicate.accountNo ||
        duplicate.enrolId ||
        duplicate.uidaiNo
      ),

    fields: {
      accountNo:
        !!duplicate.accountNo,

      enrolId:
        !!duplicate.enrolId,

      uidaiNo:
        !!duplicate.uidaiNo
    }
  });
}


function findDuplicates(
  customer,
  excludeRowNumber,
  authUser
) {
  const result = {
    accountNo:
      null,
    enrolId:
      null,
    uidaiNo:
      null
  };


  const sheet =
    getSheet(authUser);


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {
    return result;
  }


  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        19
      )
      .getDisplayValues();


  const targetAccount =
    normalizeIdentifier(
      customer.accountNo
    );

  const targetEnrol =
    normalizeIdentifier(
      customer.enrolId
    );

  const targetUidai =
    normalizeDigits(
      customer.uidaiNo
    );


  for (
    let i = 0;
    i < values.length;
    i++
  ) {
    const rowNumber =
      i + 2;


    if (
      excludeRowNumber &&
      rowNumber ===
        excludeRowNumber
    ) {
      continue;
    }


    const row =
      values[i];


    if (
      targetAccount &&
      normalizeIdentifier(
        row[1]
      ) ===
        targetAccount
    ) {
      result.accountNo = {
        rowNumber
      };
    }


    if (
      targetEnrol &&
      normalizeIdentifier(
        row[0]
      ) ===
        targetEnrol
    ) {
      result.enrolId = {
        rowNumber
      };
    }


    if (
      targetUidai &&
      normalizeDigits(
        row[12]
      ) ===
        targetUidai
    ) {
      result.uidaiNo = {
        rowNumber
      };
    }
  }


  return result;
}


function duplicateErrorResponse(
  duplicate
) {
  if (
    duplicate.accountNo
  ) {
    return jsonResponse({
      success: false,
      code:
        "DUPLICATE_ACCOUNT",
      message:
        "This Account Number already belongs to another customer."
    });
  }


  if (
    duplicate.enrolId
  ) {
    return jsonResponse({
      success: false,
      code:
        "DUPLICATE_CUSTOMER_ID",
      message:
        "This Customer ID already belongs to another customer."
    });
  }


  if (
    duplicate.uidaiNo
  ) {
    return jsonResponse({
      success: false,
      code:
        "DUPLICATE_UIDAI",
      message:
        "This UIDAI / Aadhaar Number already belongs to another customer."
    });
  }


  return null;
}


/* =========================================================
   ROW CONVERSION
========================================================= */

function customerToRow(
  customer,
  createdAt,
  updatedAt
) {
  return [
    cleanValue(
      customer.enrolId
    ),

    cleanValue(
      customer.accountNo
    ),

    cleanValue(
      customer.name
    ),

    cleanValue(
      customer.coName
    ),

    cleanValue(
      customer.status
    ),

    cleanValue(
      customer.gender
    ),

    cleanValue(
      customer.contact
    ),

    cleanValue(
      customer.accountOpeningDate
    ),

    cleanValue(
      customer.address
    ),

    cleanValue(
      customer.nominee
    ),

    cleanValue(
      customer.postOffice
    ),

    cleanValue(
      customer.passbookStatus
    ),

    normalizeDigits(
      customer.uidaiNo
    ),

    cleanValue(
      customer.dbtStatus
    ),

    cleanValue(
      customer.purposeOfAdvance
    ),

    cleanValue(
      customer.fullAddress
    ),

    cleanValue(
      customer.pinCode
    ),

    cleanValue(
      customer.pan
    ).toUpperCase(),

    cleanValue(
      customer.aofNo
    ),

    cleanValue(
      customer.photoUrl
    ),

    cleanValue(
      customer.pdfUrl
    ),

    createdAt ||
      new Date(),

    updatedAt ||
      new Date(),

    cleanValue(
      customer.updatedBy
    )
  ];
}


function rowToCustomer(
  row
) {
  return {
    enrolId:
      cleanValue(
        row[0]
      ),

    accountNo:
      cleanValue(
        row[1]
      ),

    name:
      cleanValue(
        row[2]
      ),

    coName:
      cleanValue(
        row[3]
      ),

    status:
      cleanValue(
        row[4]
      ),

    gender:
      cleanValue(
        row[5]
      ),

    contact:
      cleanValue(
        row[6]
      ),

    accountOpeningDate:
      cleanValue(
        row[7]
      ),

    address:
      cleanValue(
        row[8]
      ),

    nominee:
      cleanValue(
        row[9]
      ),

    postOffice:
      cleanValue(
        row[10]
      ),

    passbookStatus:
      cleanValue(
        row[11]
      ),

    uidaiNo:
      cleanValue(
        row[12]
      ),

    dbtStatus:
      cleanValue(
        row[13]
      ),

    purposeOfAdvance:
      cleanValue(
        row[14]
      ),

    fullAddress:
      cleanValue(
        row[15]
      ),

    pinCode:
      cleanValue(
        row[16]
      ),

    pan:
      cleanValue(
        row[17]
      ),

    aofNo:
      cleanValue(
        row[18]
      ),

    photoUrl:
      cleanValue(
        row[19]
      ),

    pdfUrl:
      cleanValue(
        row[20]
      ),

    createdAt:
      cleanValue(
        row[21]
      ),

    updatedAt:
      cleanValue(
        row[22]
      ),

    updatedBy:
      cleanValue(
        row[23]
      ),

    photoPreview:
      "",

    passbookDisplay:
      null
  };
}


/* =========================================================
   IMAGE PARSER
========================================================= */

function parseImageDataUrl(
  dataUrl
) {
  const value =
    cleanValue(
      dataUrl
    );


  const match =
    value.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );


  if (!match) {
    return null;
  }


  const mimeType =
    match[1].toLowerCase();


  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
  ];


  if (
    allowed.indexOf(
      mimeType
    ) === -1
  ) {
    throw new Error(
      "Only JPG, PNG and WEBP customer photos are allowed."
    );
  }


  return {
    mimeType,

    bytes:
      Utilities.base64Decode(
        match[2]
      )
  };
}


/* =========================================================
   DRIVE HELPERS
========================================================= */

function extractDriveFileId(
  value
) {
  const text =
    cleanValue(
      value
    );


  if (!text) {
    return "";
  }


  const fileMatch =
    text.match(
      /\/file\/d\/([a-zA-Z0-9_-]+)/
    );


  if (
    fileMatch &&
    fileMatch[1]
  ) {
    return fileMatch[1];
  }


  const idMatch =
    text.match(
      /[?&]id=([a-zA-Z0-9_-]+)/
    );


  if (
    idMatch &&
    idMatch[1]
  ) {
    return idMatch[1];
  }


  if (
    /^[a-zA-Z0-9_-]{20,}$/.test(
      text
    )
  ) {
    return text;
  }


  return "";
}


function safeTrashDriveFile(
  fileId, allowedFolderId
) {
  try {
    const file = DriveApp.getFileById(fileId);
    if (!allowedFolderId || !fileBelongsToFolder(file, allowedFolderId)) throw new Error("File is outside this workspace folder.");
    file.setTrashed(true);

  } catch (error) {
    console.error(
      error
    );
  }
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function getSheet(authUser) {
  const spreadsheetId = cleanValue(authUser && authUser.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error("This client workspace has no configured spreadsheet.");
  }
  const spreadsheet =
    SpreadsheetApp.openById(
      spreadsheetId
    );


  const sheet =
    spreadsheet.getSheetByName(
      SHEET_NAME
    );


  if (!sheet) {
    throw new Error(
      "Sheet1 was not found."
    );
  }

  ensureAuditSheet(spreadsheet);

  return sheet;
}


function ensureAuditSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(AUDIT_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(AUDIT_SHEET_NAME);
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}


function recordActivity(authUser, action, customer, details) {
  const spreadsheet = SpreadsheetApp.openById(authUser.spreadsheetId);
  const sheet = ensureAuditSheet(spreadsheet);
  sheet.appendRow([
    Utilities.getUuid(),
    new Date().toISOString(),
    authUser.tenantId || "legacy",
    authUser.uid,
    authUser.email,
    authUser.name || authUser.email,
    action,
    cleanValue(customer && customer.enrolId),
    cleanValue(customer && customer.accountNo),
    cleanValue(customer && customer.name),
    details,
  ]);
}

function activityChanges(before, after) {
  const fields = {name:"Name",accountNo:"Account Number",enrolId:"Customer ID",contact:"Mobile Number",address:"Address",gender:"Gender",dateOfBirth:"Date of Birth"};
  const changes = Object.keys(fields).filter(key => cleanValue(before[key]) !== cleanValue(after[key])).map(key =>
    fields[key] + ": " + (cleanValue(before[key]) || "(blank)") + " → " + (cleanValue(after[key]) || "(blank)"));
  return changes.length ? changes.join("; ").slice(0,500) : "Customer record updated.";
}


function getRecentActivities(authUser, requestedLimit) {
  const spreadsheet = SpreadsheetApp.openById(authUser.spreadsheetId);
  const sheet = ensureAuditSheet(spreadsheet);
  const limit = Math.min(Math.max(Number(requestedLimit) || 10, 1), 50);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ success: true, activities: [] });
  const firstRow = Math.max(2, lastRow - limit + 1);
  const rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, AUDIT_HEADERS.length)
    .getDisplayValues()
    .reverse()
    .map((row) => ({
      id: row[0],
      dateTime: row[1],
      tenantId: row[2],
      actorUid: row[3],
      email: row[4],
      user: row[5] || row[4],
      action: row[6],
      activity: row[6],
      customerId: row[7],
      accountNo: row[8],
      customerName: row[9],
      details: row[10],
    }));
  return jsonResponse({ success: true, activities: rows });
}


function getDashboardStats(authUser) {
  // getSheet() resolves the spreadsheet from the verified user's tenant. A
  // tenant with no configured Sheet fails closed in requireAuthorizedUser().
  const sheet = getSheet(authUser);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({
      success: true,
      stats: { totalCustomers: 0, kycPending: 0, passbookPending: 0, inactiveAccounts: 0 }
    });
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
  let totalCustomers = 0;
  let kycPending = 0;
  let passbookPending = 0;
  let inactiveAccounts = 0;
  rows.forEach((row) => {
    // Ignore blank trailing rows and count only actual customer records.
    if (!row.slice(0, 3).some((value) => cleanValue(value))) return;
    totalCustomers += 1;
    const accountStatus = cleanValue(row[4]).toLowerCase();
    const passbookStatus = cleanValue(row[11]).toLowerCase();
    if (accountStatus === "pending") kycPending += 1;
    if (!passbookStatus || passbookStatus === "pending") passbookPending += 1;
    if (accountStatus === "inactive") inactiveAccounts += 1;
  });

  return jsonResponse({
    success: true,
    stats: { totalCustomers, kycPending, passbookPending, inactiveAccounts }
  });
}


function cleanValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  return String(
    value
  ).trim();
}


function normalize(
  value
) {
  return cleanValue(
    value
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}


function normalizeIdentifier(
  value
) {
  return cleanValue(
    value
  )
    .toUpperCase()
    .replace(
      /\s+/g,
      ""
    );
}


function normalizeDigits(
  value
) {
  return cleanValue(
    value
  ).replace(
    /\D/g,
    ""
  );
}


function safeFileName(
  value
) {
  return cleanValue(
    value
  )
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )
    .substring(
      0,
      100
    );
}


function getImageExtension(
  mimeType
) {
  if (
    mimeType ===
    "image/png"
  ) {
    return "png";
  }


  if (
    mimeType ===
    "image/webp"
  ) {
    return "webp";
  }


  return "jpg";
}


function getErrorMessage(
  error
) {
  if (
    error &&
    error.message
  ) {
    return String(
      error.message
    );
  }


  return String(
    error ||
    "Unknown error"
  );
}


function jsonResponse(
  data
) {
  return ContentService
    .createTextOutput(
      JSON.stringify(
        data
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


/* =========================================================
   PERMISSION FUNCTIONS
   इन्हें रहने दें.
========================================================= */

function authorizeBankSetu() {
  const response =
    UrlFetchApp.fetch(
      "https://www.google.com",
      {
        muteHttpExceptions:
          true
      }
    );

  Logger.log(
    response.getResponseCode()
  );
}


function authorizeBankSetuDrive() {
  const folder =
    DriveApp.getFolderById(
      getBankSetuScriptProperty("BANKSETU_LEGACY_PHOTO_FOLDER_ID")
    );

  Logger.log(
    folder.getName()
  );
}


function authorizeBankSetuDriveWrite() {
  const folder =
    DriveApp.getFolderById(
      getBankSetuScriptProperty("BANKSETU_LEGACY_PHOTO_FOLDER_ID")
    );

  const testFile =
    folder.createFile(
      "BANK_SETU_PERMISSION_TEST.txt",
      "Bank Setu Drive write permission test."
    );

  testFile.setTrashed(
    true
  );

  Logger.log(
    "Drive write permission granted."
  );
}

function migrateOldPhotoNames() {
  const folder =
    DriveApp.getFolderById(
      getBankSetuScriptProperty("BANKSETU_LEGACY_PHOTO_FOLDER_ID")
    );

  const files =
    folder.getFiles();

  let renamed = 0;
  let skipped = 0;

  while (files.hasNext()) {
    const file =
      files.next();

    const oldName =
      file.getName();

    /*
      Already correct:
      CUSTOMERID.jpg
      CUSTOMERID.png
      CUSTOMERID.webp
    */
    if (
      /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(
        oldName
      )
    ) {
      /*
        अगर नाम में underscore है तो
        यह पुराना format हो सकता है.
      */

      const base =
        oldName.replace(
          /\.(jpg|jpeg|png|webp)$/i,
          ""
        );

      const parts =
        base.split("_");

      /*
        पुराने format में:
        ACCOUNTNO_CUSTOMERID_TIMESTAMP
      */

      if (parts.length >= 2) {
        const possibleCustomerId =
          parts[1];

        const extension =
          oldName
            .split(".")
            .pop();

        if (
          possibleCustomerId
        ) {
          const newName =
            possibleCustomerId +
            "." +
            extension;

          file.setName(
            newName
          );

          renamed++;

          Logger.log(
            oldName +
            " -> " +
            newName
          );

          continue;
        }
      }
    }

    skipped++;
  }

  Logger.log(
    "Renamed: " +
      renamed +
      ", Skipped: " +
      skipped
  );
}


/* Local-first protocol. Original A:X columns stay in their existing positions.
 * UUID and operation history are written with the customer in one row write.
 * Revision fingerprints include legacy edits and manual spreadsheet changes.
 */
const SYNC_HEADERS = ["BANKSETU RECORD ID", "BANKSETU OPERATIONS", "BANKSETU DELETED"];
const SYNC_DELETIONS_SHEET = "BANKSETU_DELETIONS";
function syncDeletionSheet(sheet, create) {
  const book = sheet.getParent();
  let ledger = book.getSheetByName(SYNC_DELETIONS_SHEET);
  if (!ledger && create) {
    ledger = book.insertSheet(SYNC_DELETIONS_SHEET);
    ledger.getRange(1, 1, 1, 3).setValues([["RECORD ID", "OPERATION ID", "CONNECTION ID"]]);
    ledger.hideSheet();
  }
  if (ledger && ledger.getRange(1, 1, 1, 3).getDisplayValues()[0].join("|") !== "RECORD ID|OPERATION ID|CONNECTION ID")
    throw new Error("Deletion ledger name is already in use. No customer was deleted.");
  return ledger;
}
function syncDeletionRows(sheet, connectionId) {
  const ledger = syncDeletionSheet(sheet, false);
  return ledger && ledger.getLastRow() > 1 ? ledger.getRange(2, 1, ledger.getLastRow() - 1, 3).getDisplayValues().filter(row => row[2] === connectionId) : [];
}
const SYNC_RESET_SHEET = "BANKSETU_SYNC_RESETS";
const SYNC_CHANGES_SHEET = "BANKSETU_CUSTOMER_CHANGES";
const SYNC_LATEST_SHEET = "BANKSETU_CHANGE_LATEST";
function syncLatestSheet(sheet){
  const book=sheet.getParent();let latest=book.getSheetByName(SYNC_LATEST_SHEET);
  if(!latest){latest=book.insertSheet(SYNC_LATEST_SHEET);latest.getRange(1,1,1,5).setValues([["RECORD ID","ACTION","OPERATION ID","CONNECTION ID","SEQUENCE"]]);latest.hideSheet();}
  if(latest.getRange(1,1,1,5).getDisplayValues()[0].join("|")!=="RECORD ID|ACTION|OPERATION ID|CONNECTION ID|SEQUENCE")
    throw new Error("Latest change index name is in use. No sync cursor was advanced.");
  return latest;
}
function syncChangeHead(ledger){
  const stored=Number(ledger.getRange(1,8,1,1).getDisplayValues()[0][0]);
  return Math.max(ledger.getLastRow()-1,Number.isSafeInteger(stored)?stored:0);
}
function indexSyncChange(latest,row,sequence){
  const count=latest.getLastRow()-1;
  const entries=count?latest.getRange(2,1,count,5).getDisplayValues():[];
  const index=entries.findIndex(entry=>entry[0]===row[0]&&entry[3]===row[3]);
  if(index>=0 && Number(entries[index][4])>=sequence)return;
  const values=[row[0],row[1],row[2],row[3],sequence];
  if(index>=0)latest.getRange(index+2,1,1,5).setValues([values]);else latest.appendRow(values);
}
// The old journal had row-position cursors. Migrate it in bounded pieces before
// removing any row; an interrupted migration resumes without invalidating cursors.
function advanceSyncIndex(sheet,ledger){
  const latest=syncLatestSheet(sheet),head=syncChangeHead(ledger);
  const progress=Number(ledger.getRange(1,9,1,1).getDisplayValues()[0][0])||0;
  if(progress<head){
    const count=Math.min(500,head-progress,Math.max(0,ledger.getLastRow()-1-progress));
    const rows=count?ledger.getRange(progress+2,1,count,4).getDisplayValues():[];
    const oldCount=latest.getLastRow()-1;
    const existing=oldCount?latest.getRange(2,1,oldCount,5).getDisplayValues():[];
    const positions=new Map(existing.map((row,i)=>[row[3]+":"+row[0],i]));
    const additions=[];
    for(let i=0;i<rows.length;i++){
      const row=rows[i],sequence=progress+i+1,key=row[3]+":"+row[0],position=positions.get(key);
      if(position!==undefined){
        const before=position<existing.length?existing[position]:additions[position-existing.length];
        if(Number(before[4])>=sequence)continue;
        const value=[row[0],row[1],row[2],row[3],sequence];
        if(position<existing.length){latest.getRange(position+2,1,1,5).setValues([value]);existing[position]=value;}
        else additions[position-existing.length]=value;
      }else{positions.set(key,existing.length+additions.length);additions.push([row[0],row[1],row[2],row[3],sequence]);}
    }
    if(additions.length)latest.getRange(oldCount+2,1,additions.length,5).setValues(additions);
    if(rows.length){if(progress+rows.length>=head)ledger.getRange(1,8,1,1).setValues([[head]]);
      ledger.getRange(1,9,1,1).setValues([[progress+rows.length]]);}
    SpreadsheetApp.flush();
  }
  return {latest,ready:(Number(ledger.getRange(1,9,1,1).getDisplayValues()[0][0])||0)>=head};
}
function syncChangeSheet(sheet, create) {
  const book=sheet.getParent();let ledger=book.getSheetByName(SYNC_CHANGES_SHEET);
  if(!ledger&&create){ledger=book.insertSheet(SYNC_CHANGES_SHEET);ledger.getRange(1,1,1,7).setValues([["RECORD ID","ACTION","OPERATION ID","CONNECTION ID","AT","EPOCH:"+Utilities.getUuid(),""]]);ledger.hideSheet();}
  if(ledger&&ledger.getRange(1,1,1,4).getDisplayValues()[0].join("|")!=="RECORD ID|ACTION|OPERATION ID|CONNECTION ID")
    throw new Error("Customer change ledger name is in use. No sync cursor was advanced.");
  if(ledger&&!String(ledger.getRange(1,6,1,1).getDisplayValues()[0][0]).startsWith("EPOCH:"))
    throw new Error("Customer change ledger checkpoint is missing. No sync cursor was advanced.");
  return ledger;
}
function recordSyncChange(sheet,recordId,action,operationId,connectionId){
  const ledger=syncChangeSheet(sheet,true),count=ledger.getLastRow()-1;
  const latest=syncLatestSheet(sheet),latestCount=latest.getLastRow()-1;
  if(latestCount){
    const matching=latest.getRange(2,1,latestCount,5).getDisplayValues().find(row=>row[0]===recordId&&row[3]===connectionId);
    if(matching&&matching[2]===operationId){
      const head=syncChangeHead(ledger),sequence=Number(matching[4]);
      if(sequence>head){ledger.getRange(1,8,1,1).setValues([[sequence]]);
        if(Number(ledger.getRange(1,9,1,1).getDisplayValues()[0][0])===head)ledger.getRange(1,9,1,1).setValues([[sequence]]);
        SpreadsheetApp.flush();}
      return;
    }
  }
  // A timed-out operation can be replayed. Its customer row and its change
  // event must both be repairable with the same stable operation identity.
  if(count){
    const column=ledger.getRange(2,3,count,1);
    const found=typeof column.createTextFinder==="function"?column.createTextFinder(operationId).matchEntireCell(true).findNext()
      :column.getDisplayValues().some(row=>row[0]===operationId);
    if(found){
      const rows=ledger.getRange(2,1,count,8).getDisplayValues();
      const index=rows.findIndex(row=>row[2]===operationId);
      if(index>=0){const sequence=Number(rows[index][7])||index+1;
        indexSyncChange(latest,rows[index],sequence);
        if(syncChangeHead(ledger)<sequence)ledger.getRange(1,8,1,1).setValues([[sequence]]);
        if(Number(ledger.getRange(1,9,1,1).getDisplayValues()[0][0])===sequence-1)
          ledger.getRange(1,9,1,1).setValues([[sequence]]);
        SpreadsheetApp.flush();}
      return;
    }
  }
  const head=syncChangeHead(ledger),sequence=head+1;
  ledger.appendRow([recordId,action,operationId,connectionId,new Date().toISOString(),"","",sequence]);
  // The row is durable before publishing the head. Replayed operations repair
  // an interrupted index write using their stable operation ID.
  indexSyncChange(latest,[recordId,action,operationId,connectionId],sequence);
  ledger.getRange(1,8,1,1).setValues([[sequence]]);
  if(Number(ledger.getRange(1,9,1,1).getDisplayValues()[0][0])===head)
    ledger.getRange(1,9,1,1).setValues([[sequence]]);
  SpreadsheetApp.flush();
}
function customerChangeTriggersReady(authUser){
  try{return installCustomerChangeTriggers(authUser.spreadsheetId);}
  catch(error){return false;} // Keep the full scan when triggers cannot be verified.
}
function installCustomerChangeTriggers(id){
  if(!id||typeof ScriptApp==="undefined"||typeof ScriptApp.getProjectTriggers!=="function"||typeof ScriptApp.newTrigger!=="function")
    throw new Error("Sheet change triggers cannot be installed for this workspace.");
  const installed=ScriptApp.getProjectTriggers();
  for(const [handler,event] of [["bankSetuCustomerEdited","onEdit"],["bankSetuCustomerStructureChanged","onChange"]]){
    if(installed.some(trigger=>trigger.getHandlerFunction()===handler&&trigger.getTriggerSourceId()===id))continue;
    ScriptApp.newTrigger(handler).forSpreadsheet(id)[event]().create();
  }
  return true;
}
// Run once from the bound Apps Script editor if the authenticated diagnostic
// reports that Sheet triggers are unavailable. Google presents required OAuth
// permissions to the script owner; no customer row or local queue is changed.
function authorizeBankSetuChangeJournal(){
  const id=getBankSetuScriptProperty("BANKSETU_CLIENT_SPREADSHEET_ID")||LEGACY_SPREADSHEET_ID;
  if(!id)throw new Error("Configure the workspace spreadsheet in Script Properties first.");
  return installCustomerChangeTriggers(id);
}
function bankSetuManualSheet(event){
  const book=event&&event.source;
  const allowed=getBankSetuScriptProperty("BANKSETU_CLIENT_SPREADSHEET_ID")||LEGACY_SPREADSHEET_ID;
  if(!book||!allowed||book.getId()!==allowed)return null;
  return book.getSheetByName(SHEET_NAME);
}
function bankSetuCustomerEdited(event){
  const sheet=bankSetuManualSheet(event),range=event&&event.range;
  if(!sheet||!range||range.getSheet().getName()!==SHEET_NAME||range.getRow()<2)return;
  const lock=LockService.getScriptLock();if(!acquireSyncLock(lock))throw new Error("Customer change event is busy; the next full audit will reconcile it.");
  try{
    if(range.getNumRows()>100){recordSyncChange(sheet,"","RECONCILE",Utilities.getUuid(),"MANUAL");return;}
    for(let row=range.getRow();row<range.getRow()+range.getNumRows();row++){
      let id=String(sheet.getRange(row,25,1,1).getDisplayValues()[0][0]||"");
      if(!/^[a-f0-9-]{36}$/i.test(id)){
        // Do not overwrite an existing custom value in the stable-ID column.
        if(id){recordSyncChange(sheet,"","RECONCILE",Utilities.getUuid(),"MANUAL");continue;}
        id=Utilities.getUuid();sheet.getRange(row,25,1,1).setValues([[id]]);
      }
      recordSyncChange(sheet,id,"UPSERT",Utilities.getUuid(),"MANUAL");
    }
  }finally{lock.releaseLock();}
}
function bankSetuCustomerStructureChanged(event){
  if(!event||event.changeType==="EDIT"||event.changeType==="FORMAT")return;
  const sheet=bankSetuManualSheet(event);if(!sheet)return;
  const lock=LockService.getScriptLock();if(!acquireSyncLock(lock))throw new Error("Structural change is busy; the next full audit will reconcile it.");
  try{recordSyncChange(sheet,"","RECONCILE",Utilities.getUuid(),"MANUAL");}finally{lock.releaseLock();}
}
function getCustomerChanges(request,authUser){
  if(request.connectionId!==authUser.connectionId||!authUser.connectionId)return jsonResponse({success:false,code:"CONNECTION_CHANGED"});
  const ids=request.recordIds;
  if(!Array.isArray(ids)||ids.length>50||ids.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw new Error("Invalid changed customer IDs.");
  const lock=LockService.getScriptLock();if(!acquireSyncLock(lock))return syncBusyResponse();
  try{
    const ledger=syncChangeSheet(getSheet(authUser),true);
    if(ledger.getRange(1,7,1,1).getDisplayValues()[0][0]||request.changeEpoch!==ledger.getRange(1,6,1,1).getDisplayValues()[0][0].slice(6))
      return jsonResponse({success:false,code:"REBASE_REQUIRED",message:"Customer change history was compacted; a full recovery scan is required."});
    const sheet=getSheet(authUser),count=Math.max(0,sheet.getLastRow()-1),column=count?sheet.getRange(2,25,count,1):null;
    const customers=[],deletedIds=[];
    for(const id of [...new Set(ids)]){
      let rowNumber=0;
      if(column){
        const found=typeof column.createTextFinder==="function"?column.createTextFinder(id).matchEntireCell(true).findNext():null;
        if(found)rowNumber=found.getRow();
        else if(typeof column.createTextFinder!=="function"){
          const offset=column.getDisplayValues().findIndex(row=>row[0]===id);if(offset>=0)rowNumber=offset+2;
        }
      }
      if(!rowNumber){deletedIds.push(id);continue;}
      const row=sheet.getRange(rowNumber,1,1,syncDataWidth(sheet)).getDisplayValues()[0];
      if(row[26]==="true")deletedIds.push(id);else customers.push(syncCustomerObject(row,rowNumber));
    }
    return jsonResponse({success:true,customers,deletedIds});
  }finally{lock.releaseLock();}
}
function syncResetSheet(sheet, create) {
  const book = sheet.getParent();
  let ledger = book.getSheetByName(SYNC_RESET_SHEET);
  if (!ledger && create) {
    ledger = book.insertSheet(SYNC_RESET_SHEET);
    ledger.getRange(1,1,1,3).setValues([["CONNECTION ID","RESET ID","UPDATED AT"]]);
    ledger.hideSheet();
  }
  if (ledger && ledger.getRange(1,1,1,3).getDisplayValues()[0].join("|") !== "CONNECTION ID|RESET ID|UPDATED AT")
    throw new Error("Reset ledger name is already in use. No local reset was published.");
  return ledger;
}
// One tenant-folder name inventory replaces thousands of missing-photo searches.
// No Sheet lock, customer writes, blobs or photo downloads are needed.
function getPhotoPresence(request,authUser) {
  if(request.photoIndexVersion===1)return getIncrementalPhotoIndex(request,authUser);
  if(request.connectionId!==authUser.connectionId||!authUser.connectionId)return jsonResponse({success:false,code:"CONNECTION_CHANGED"});
  if(!authUser.photoFolderId)throw new Error("A verified tenant Drive folder is required.");
  const files=DriveApp.getFolderById(authUser.photoFolderId).getFiles();
  const ids=new Set();let count=0;const started=Date.now();
  while(files.hasNext()){
    if(++count>10000||Date.now()-started>15000)return jsonResponse({success:false,code:"PHOTO_INVENTORY_INCOMPLETE"});
    const file=files.next(),name=file.getName();
    const legacy=/^(.+)\.(?:jpg|jpeg|png|webp)$/i.exec(name);
    const uploaded=/^[a-f0-9-]{36}-(.+)-photo$/i.exec(name);
    if(legacy)ids.add(legacy[1]);
    else if(uploaded)ids.add(uploaded[1]);
  }
  return jsonResponse({success:true,connectionId:authUser.connectionId,complete:true,customerIds:[...ids]});
}
function acquireSyncLock(lock) {
  if (typeof lock.tryLock === "function") return lock.tryLock(5000);
  lock.waitLock(5000);return true;
}
function syncBusyResponse(){return jsonResponse({success:false,code:"SYNC_BUSY",message:"Another sync request is active. Retry automatically; local changes remain pending."});}
// getMaxColumns includes unused, formatted columns. Large client sheets may
// reserve hundreds of them; only occupied columns participate in sync hashes.
function syncDataWidth(sheet){return Math.max(27,sheet.getLastColumn());}
function syncProtection(request, authUser) {
  if (request.connectionId !== authUser.connectionId || !authUser.connectionId)
    return jsonResponse({success:false,code:"CONNECTION_CHANGED",message:"Workspace connection changed."});
  // An authenticated, tenant-bound capability check must not scan thousands
  // of Sheet cells or acquire the sync lock. GET /status cannot establish
  // which POST deployment and workspace the application is actually using.
  if (request.action === "getSyncProtection" && request.capabilitiesOnly === true)
    return jsonResponse({success:true,protectionVersion:1,photoIndexVersion:1,afsmVersion:1,connectionId:authUser.connectionId,
      ...(request.diagnoseTriggers===true?{changeJournalReady:customerChangeTriggersReady(authUser)}:{})});
  if (request.action === "publishLocalReset" && !["client_admin","master_owner","admin"].includes(authUser.role))
    throw new Error("Administrator permission is required.");
  const lock=LockService.getScriptLock();if(!acquireSyncLock(lock))return syncBusyResponse();
  try {
    const sheet=getSheet(authUser);
    let ledger=syncResetSheet(sheet,request.action === "publishLocalReset");
    let resetId="";
    if (ledger) {
      const rows=ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,3).getDisplayValues():[];
      const index=rows.findIndex(row=>row[0]===authUser.connectionId);
      if (request.action === "publishLocalReset") {
        if (!/^[a-f0-9-]{36}$/i.test(request.resetId||"")) throw new Error("Invalid reset identity.");
        resetId=String(request.resetId);
        if (index>=0) ledger.getRange(index+2,1,1,3).setValues([[authUser.connectionId,resetId,new Date().toISOString()]]);
        else ledger.appendRow([authUser.connectionId,resetId,new Date().toISOString()]);
        SpreadsheetApp.flush();
      } else if (index>=0) resetId=rows[index][1];
    }
    const changes=syncChangeSheet(sheet,true);
    const latestChange=syncChangeHead(changes);
    const epoch=changes.getRange(1,6,1,1).getDisplayValues()[0][0].slice(6);
    const compacting=changes.getRange(1,7,1,1).getDisplayValues()[0][0]==="COMPACTING";
    const indexed=compacting?null:advanceSyncIndex(sheet,changes);
    if(indexed?.ready&&changes.getLastRow()>1){
      changes.deleteRows(2,Math.min(1000,changes.getLastRow()-1));SpreadsheetApp.flush();
    }
    const triggersReady=customerChangeTriggersReady(authUser);
    const cursor=Number(request.changeCursor);
    if(!compacting&&!indexed?.ready&&triggersReady&&request.action==="getSyncProtection"&&request.changeEpoch===epoch&&request.changeCursor!==undefined&&Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=latestChange){
      const size=Math.min(500,latestChange-cursor);
      const events=size?changes.getRange(cursor+2,1,size,4).getDisplayValues():[];
      const relevant=events.filter(row=>row[3]===authUser.connectionId||row[3]==="MANUAL");
      const latestById=new Map();for(const row of relevant)if(row[0])latestById.set(row[0],row[1]);
      if(!relevant.some(row=>row[1]==="RECONCILE"))return jsonResponse({success:true,protectionVersion:1,connectionId:authUser.connectionId,resetId,photoIndexVersion:1,afsmVersion:1,
        incremental:true,changeJournalReady:true,changeEpoch:epoch,changeCursor:cursor+size,hasMoreChanges:cursor+size<latestChange,
        changedIds:[...latestById].filter(([,action])=>action==="UPSERT").map(([id])=>id),deletedIds:[...latestById].filter(([,action])=>action==="DELETE").map(([id])=>id)});
    }
    // A completed checkpoint has no time limit. The journal epoch and cursor
    // identify the cloud state even when a device has been closed for days.
    if(!compacting&&indexed?.ready&&triggersReady&&request.action==="getSyncProtection"&&request.changeEpoch===epoch&&request.changeCursor!==undefined&&Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=latestChange){
      // A matching durable head proves there are no newer events. Avoid
      // reading the per-customer index merely because the app was idle.
      if(cursor===latestChange)return jsonResponse({success:true,protectionVersion:1,connectionId:authUser.connectionId,resetId,photoIndexVersion:1,afsmVersion:1,
        incremental:true,changeJournalReady:true,changeEpoch:epoch,changeCursor:latestChange,hasMoreChanges:false,changedIds:[],deletedIds:[]});
      const count=indexed.latest.getLastRow()-1;
      const entries=count?indexed.latest.getRange(2,1,count,5).getDisplayValues():[];
      const latestById=new Map();
      for(const row of entries)if((row[3]===authUser.connectionId||row[3]==="MANUAL")&&Number(row[4])>cursor){
        const prior=latestById.get(row[0]);if(!prior||Number(row[4])>Number(prior[4]))latestById.set(row[0],row);
      }
      const relevant=[...latestById.values()].sort((a,b)=>Number(a[4])-Number(b[4]));
      if(!relevant.some(row=>row[1]==="RECONCILE")){
        const page=relevant.slice(0,500);
        return jsonResponse({success:true,protectionVersion:1,connectionId:authUser.connectionId,resetId,photoIndexVersion:1,afsmVersion:1,
          incremental:true,changeJournalReady:true,changeEpoch:epoch,changeCursor:relevant.length>page.length?Number(page[page.length-1][4]):latestChange,hasMoreChanges:relevant.length>page.length,
          changedIds:page.filter(row=>row[1]==="UPSERT").map(row=>row[0]),deletedIds:page.filter(row=>row[1]==="DELETE").map(row=>row[0])});
      }
    }
    ensureSyncMetadata(sheet);
    const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,syncDataWidth(sheet)).getDisplayValues():[];
    const remoteRevision=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(rows)).map(byte=>(byte+256).toString(16).slice(-2)).join("");
    if(compacting){
      // Legacy interrupted compaction still requires an authoritative recovery.
      const remove=Math.min(1000,latestChange);
      if(remove){changes.deleteRows(2,remove);SpreadsheetApp.flush();}
      if(changes.getLastRow()===1){
        const stale=syncLatestSheet(sheet);if(stale.getLastRow()>1)stale.deleteRows(2,stale.getLastRow()-1);
        changes.getRange(1,7,1,3).setValues([["",0,0]]);SpreadsheetApp.flush();
      }
    }
    return jsonResponse({success:true,protectionVersion:1,connectionId:authUser.connectionId,resetId,remoteRevision,changeJournalReady:triggersReady,changeEpoch:epoch,changeCursor:latestChange,photoIndexVersion:1,afsmVersion:1,
      activeIds:rows.filter(row=>row[26]!=="true").map(row=>String(row[24])).filter(Boolean),
      deletedIds:syncDeletionRows(sheet,authUser.connectionId).map(row=>String(row[0]))});
  } finally {lock.releaseLock();}
}
function ensureSyncMetadata(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length + SYNC_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length + SYNC_HEADERS.length - sheet.getMaxColumns());
  const actual = sheet.getRange(1, 25, 1, 3).getDisplayValues()[0];
  if (actual.some((cell, i) => cell && cell !== SYNC_HEADERS[i])) throw new Error("Columns Y:AA are already in use. Sync migration stopped without overwriting them.");
  if (actual.some((cell,i)=>cell!==SYNC_HEADERS[i])) sheet.getRange(1, 25, 1, 3).setValues([SYNC_HEADERS]);
  const count = sheet.getLastRow() - 1;
  if (count > 0) {
    const meta = sheet.getRange(2, 25, count, 3).getValues();
    let changed = false;
    meta.forEach(row => { if (!row[0]) { row[0] = Utilities.getUuid(); changed = true; } });
    if (changed) sheet.getRange(2, 25, count, 3).setValues(meta);
  }
}
function ensureAfsmColumns(sheet) {
  const width=Math.max(27,typeof sheet.getLastColumn === "function" ? sheet.getLastColumn() : sheet.getMaxColumns());
  const headers=sheet.getRange(1,1,1,width).getDisplayValues()[0];
  const names=["BANKSETU AFSM JSON","Form Send to Branch"];
  let end=width;const columns={};
  names.forEach(name=>{
    const matches=headers.map((value,index)=>value===name?index+1:0).filter(Boolean);
    if(matches.length>1)throw new Error("Duplicate AFSM columns require administrator review. No data changed.");
    let col=matches[0];
    if(!col){col=++end;if(sheet.getMaxColumns()<col)sheet.insertColumnsAfter(sheet.getMaxColumns(),col-sheet.getMaxColumns());sheet.getRange(1,col,1,1).setValues([[name]]);}
    columns[name]=col;
  });return columns;
}
function afsmFromRow(row) {
  const encoded=row.slice(27).find(value=>typeof value==="string"&&value.indexOf("AFSM:")===0);
  if(!encoded)return {};
  try {const value=JSON.parse(encoded.slice(5));return value.afsmStatus==="sent"?value:{};}catch(error){throw new Error("Invalid AFSM metadata. Review the customer row before updating.");}
}
function afsmCell(value) {
  const date=new Date(value.afsmSentAt);
  if(isNaN(date.getTime()))throw new Error("Invalid AFSM date.");
  return "AFSM Send to Branch ("+Utilities.formatDate(date,"Asia/Kolkata","dd/MM/yyyy")+")";
}
function syncRevision(row) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(row.slice(0, 24).concat(Object.keys(photoMetadataFromRow(row)).length?[photoMetadataFromRow(row)]:[]).concat(Object.keys(afsmFromRow(row)).length?[afsmFromRow(row)]:[]))).map(byte => (byte + 256).toString(16).slice(-2)).join("");
}
function syncCustomerObject(row, rowNumber) {
  return Object.assign(rowToCustomer(row), afsmFromRow(row), photoMetadataFromRow(row), {recordId: String(row[24]), revision: syncRevision(row), rowNumber});
}
function localFirstRead(request, authUser) {
  const lock = LockService.getScriptLock(); if(!acquireSyncLock(lock))return syncBusyResponse();
  let detail;
  try {
    const sheet = getSheet(authUser); ensureSyncMetadata(sheet);
    if (["getCustomerPage","getAllCustomers"].includes(request.action)) {
      const deletions=syncDeletionRows(sheet,authUser.connectionId);
      const total=Math.max(0,sheet.getLastRow()-1);
      const size=Math.min(250,Math.max(1,Number(request.pageSize)||250));
      const cursor=request.action==="getCustomerPage"?Number(request.cursor||0):((Math.max(1,Number(request.page)||1)-1)*size);
      if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error("Invalid customer page cursor.");
      const count=Math.min(size,Math.max(0,total-cursor));
      const batch=count?sheet.getRange(cursor+2,1,count,syncDataWidth(sheet)).getDisplayValues():[];
      const customers=batch.map((row,i)=>row[26]==="true"?null:syncCustomerObject(row,cursor+i+2)).filter(Boolean);
      const deletedIds=deletions.slice(cursor,cursor+size).map(row=>String(row[0])).concat(batch.filter(row=>row[26]==="true").map(row=>String(row[24])));
      const nextCursor=cursor+size;
      return jsonResponse({success:true,customers,deletedIds,nextCursor,hasNextPage:nextCursor<Math.max(total,deletions.length),totalRows:total});
    }
    // Photo reads usually have a stable ID and its last known row. Verify both
    // under the same lock; fall back to ID search only when rows have moved.
    const rowNumber=Number(request.rowNumber);
    const direct=request.action==="getCustomerByRowNumber"&&Number.isSafeInteger(rowNumber)&&rowNumber>=2&&rowNumber<=sheet.getLastRow()
      ? sheet.getRange(rowNumber,1,1,syncDataWidth(sheet)).getDisplayValues()[0] : null;
    const matched=direct&&direct[26]!=="true"&&(!request.recordId||String(direct[24])===String(request.recordId));
    const values = matched ? [direct] : sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow()-1, syncDataWidth(sheet)).getDisplayValues() : [];
    let customers = values.map((row, i) => row[26] === "true" ? null : syncCustomerObject(row, matched?rowNumber:i+2)).filter(Boolean);
    if (request.action === "getAllCustomers") return jsonResponse({success:true,customers,fullSnapshot:true});
    if (request.action === "getCustomerByRowNumber") customers = customers.filter(customer => request.recordId ? customer.recordId === String(request.recordId) : customer.rowNumber === Number(request.rowNumber));
    else {
      const query = normalize(request.query);
      customers = query ? customers.filter(customer => ["enrolId","accountNo","name","pan","aofNo","contact","uidaiNo"].some(key => normalize(customer[key]).includes(query))) : [];
    }
    if (!customers.length) return jsonResponse({success:false,message:"Customer not found."});
    detail = {customer:customers[0],matches:customers};
  } finally { lock.releaseLock(); }
  // Sheet identity and revision are captured under the lock. Drive reads can
  // run concurrently without blocking the next tenant-scoped photo request.
  const {customer,matches}=detail;
  if (customer.photoUrl) {
    const photo = getBoundPhotoForSync(customer.photoUrl, authUser.photoFolderId);
    if (photo.notFound) customer.photoNotFound = true;
    else customer.photoPreview = photo.preview;
  }
  else {
    const photo = findPhotoByCustomerId(customer.enrolId, authUser.photoFolderId);
    if (photo) { customer.photoUrl = photo.driveUrl; const resolved=getBoundPhotoForSync(photo.driveUrl, authUser.photoFolderId);if(resolved.notFound)customer.photoNotFound=true;else customer.photoPreview=resolved.preview; }
    else customer.photoNotFound = true; // Verified folder lookup; temporary Drive errors throw and remain retryable.
  }
  customer.passbookDisplay = getPassbookDisplay(customer.passbookStatus);
  return jsonResponse({success:true,customer,rowNumber:customer.rowNumber,matches,multipleMatches:matches.length>1,photoNotFound:customer.photoNotFound===true});
}
// A Drive read failure is not evidence that a photo does not exist. Only an
// authoritative 404 or a verified folder mismatch can settle a stale URL.
function getBoundPhotoForSync(photoUrl, folderId) {
  const fileId=extractDriveFileId(photoUrl);
  if(!fileId||!folderId)throw new Error("A valid tenant photo reference is required.");
  let metadata;
  try {metadata=photoDriveJson("files/"+encodeURIComponent(fileId),{fields:"id,mimeType,size,parents,trashed",supportsAllDrives:true});}
  catch(error){if(/\bHTTP 404\b/.test(String(error.message||"")))return {notFound:true};throw error;}
  if(metadata.trashed||!(metadata.parents||[]).includes(folderId))return {notFound:true};
  if(!/^image\//.test(metadata.mimeType||""))throw new Error("The linked Drive file is not an image.");
  if(Number(metadata.size)>MAX_PHOTO_SIZE)throw new Error("The linked photo exceeds the supported size.");
  const blob=DriveApp.getFileById(fileId).getBlob();
  const bytes=blob.getBytes();
  if(bytes.length>MAX_PHOTO_SIZE||!/^image\//.test(blob.getContentType()||""))throw new Error("The linked photo cannot be read as a supported image.");
  return {preview:"data:"+blob.getContentType()+";base64,"+Utilities.base64Encode(bytes)};
}
function deleteSyncedCustomerDriveFiles(row, authUser) {
  const folderId = cleanValue(authUser.photoFolderId);
  const urls = [cleanValue(row[19]), cleanValue(row[20])].filter(Boolean);
  if (urls.length && !folderId) throw new Error("This tenant has no verified Drive folder for customer deletion.");
  const ids = [...new Set(urls.map(url => {
    const id = extractDriveFileId(url);
    if (!id && /drive.google.com/i.test(url)) throw new Error("Customer Drive file link is invalid; deletion remains pending.");
    return id;
  }).filter(Boolean))];
  for (const id of ids) {
    const file = DriveApp.getFileById(id);
    if (!fileBelongsToFolder(file, folderId)) throw new Error("Customer file is outside this tenant's Drive folder.");
    file.setTrashed(true);
  }
  // Older customer photos may have been saved by customer ID instead of URL.
  if (folderId && cleanValue(row[0])) {
    const folder = DriveApp.getFolderById(folderId);
    const base = safeFileName(row[0]);
    for (const extension of [".jpg",".jpeg",".png",".webp",".JPG",".JPEG",".PNG",".WEBP"]) {
      const files = folder.getFilesByName(base + extension);
      while (files.hasNext()) files.next().setTrashed(true);
    }
  }
  return true;
}

function syncCustomerOperation(request, authUser, preparedMedia) {
  const op = request.operation || {};
  if (request.connectionId !== authUser.connectionId || !authUser.connectionId) return jsonResponse({success:false,code:"CONNECTION_CHANGED",message:"Workspace connection changed. Old queue remains on its original connection."});
  if (!/^[a-f0-9-]{36}$/i.test(op.recordId || "") || !/^[a-f0-9-]{36}$/i.test(op.operationId || "")) throw new Error("Invalid sync identity.");
  if (!["saveCustomer","updateCustomer","markPassbookPrinted","markPassbookDelivered","markAfsmSent","deleteCustomer"].includes(op.action)) throw new Error("Unsupported queued operation.");
  if (op.action === "deleteCustomer" && !["client_admin","master_owner","admin"].includes(authUser.role)) throw new Error("Administrator permission is required.");
  const lock = LockService.getScriptLock(); if(!acquireSyncLock(lock))return syncBusyResponse();
  let held=true;
  try {
    const sheet = getSheet(authUser); ensureSyncMetadata(sheet);
    const resetLedger=syncResetSheet(sheet,false);
    const resetRows=resetLedger&&resetLedger.getLastRow()>1?resetLedger.getRange(2,1,resetLedger.getLastRow()-1,3).getDisplayValues():[];
    const resetRow=resetRows.find(row=>row[0]===authUser.connectionId);
    if (resetRow && resetRow[1] !== String(request.protectionResetId||""))
      return jsonResponse({success:false,code:"RESET_REQUIRED",message:"Another device reset this workspace. Reconcile local data before uploading."});
    const rows = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,syncDataWidth(sheet)).getDisplayValues() : [];
    const index = rows.findIndex(row => String(row[24]) === op.recordId);
    const existing = index >= 0 ? rows[index] : null;
    const deleted = syncDeletionRows(sheet,authUser.connectionId).find(row => row[0] === op.recordId);
    if (deleted) {
      if (op.action !== "deleteCustomer" || deleted[1] !== op.operationId) return jsonResponse({success:false,code:"CONFLICT",message:"This customer was already deleted."});
      if (existing) { deleteSyncedCustomerDriveFiles(existing, authUser); sheet.deleteRow(index+2); SpreadsheetApp.flush(); }
      recordSyncChange(sheet,op.recordId,"DELETE",op.operationId,authUser.connectionId);
      return jsonResponse({success:true,replayed:true,deleted:true,driveDeleted:true,rowDeleted:true,recordId:op.recordId});
    }
    const operations = existing && existing[25] ? JSON.parse(existing[25]) : [];
    if (operations.includes(op.operationId)) {
      const wasDeleted = op.action === "deleteCustomer" && existing[26] === "true";
      if (wasDeleted) deleteSyncedCustomerDriveFiles(existing, authUser);
      recordSyncChange(sheet,op.recordId,wasDeleted?"DELETE":"UPSERT",op.operationId,authUser.connectionId);
      return jsonResponse({success:true,replayed:true,rowNumber:index+2,revision:syncRevision(existing),deleted:wasDeleted,driveDeleted:wasDeleted,customer:syncCustomerObject(existing,index+2)});
    }
    if (existing && (existing[26] === "true" || op.baseRevision !== syncRevision(existing))) return jsonResponse({success:false,code:"CONFLICT",message:"This customer changed in Google Sheets. Both versions are retained for administrator review.",customer:syncCustomerObject(existing,index+2)});
    if (!existing && op.action !== "saveCustomer") return jsonResponse({success:false,code:"CONFLICT",message:"The original customer was removed. No other row was changed."});
    if (!existing && op.baseRevision) return jsonResponse({success:false,code:"CONFLICT",message:"Original record is missing."});
    if (op.action === "deleteCustomer") {
      deleteSyncedCustomerDriveFiles(existing, authUser);
      const ledger=syncDeletionSheet(sheet,true);
      ledger.appendRow([op.recordId,op.operationId,authUser.connectionId]);
      SpreadsheetApp.flush();
      sheet.deleteRow(index+2);
      SpreadsheetApp.flush();
      recordSyncChange(sheet,op.recordId,"DELETE",op.operationId,authUser.connectionId);
      try { recordActivity(authUser,"DELETE",rowToCustomer(existing),"Customer deleted from Google Sheet and Drive."); } catch (error) { console.error(error); }
      return jsonResponse({success:true,deleted:true,driveDeleted:true,rowDeleted:true,recordId:op.recordId});
    }
    if(op.action === "markAfsmSent") {
      if(!["client_admin","client_user","master_owner","master_admin","admin","user"].includes(authUser.role))throw new Error("Customer write permission is required.");
      const patch=op.customer||{},old=afsmFromRow(existing);
      if(patch.afsmStatus!=="sent"||!/^[a-f0-9-]{36}$/i.test(patch.afsmOperationId||"")||!Number.isFinite(Date.parse(patch.afsmSentAt))||Date.parse(patch.afsmSentAt)>Date.now()+300000)throw new Error("Invalid AFSM confirmation.");
      if(old.afsmStatus==="sent"&&!patch.afsmResend)return jsonResponse({success:false,code:"CONFLICT",message:"This customer was already sent. Original AFSM date is preserved; review before re-sending.",customer:syncCustomerObject(existing,index+2)});
      const columns=ensureAfsmColumns(sheet),value={afsmStatus:"sent",afsmSentAt:patch.afsmSentAt,afsmOperationId:patch.afsmOperationId,afsmUpdatedAt:new Date().toISOString()};
      operations.push(op.operationId);
      if(JSON.stringify(operations).length>45000)throw new Error("Operation history is full.");
      sheet.getRange(index+2,columns["BANKSETU AFSM JSON"],1,1).setValues([["AFSM:"+JSON.stringify(value)]]);
      sheet.getRange(index+2,columns["Form Send to Branch"],1,1).setValues([[afsmCell(value)]]);
      sheet.getRange(index+2,26,1,1).setValues([[JSON.stringify(operations)]]);SpreadsheetApp.flush();
      recordSyncChange(sheet,op.recordId,"UPSERT",op.operationId,authUser.connectionId);
      const saved=sheet.getRange(index+2,1,1,syncDataWidth(sheet)).getDisplayValues()[0];
      return jsonResponse({success:true,rowNumber:index+2,revision:syncRevision(saved),customer:syncCustomerObject(saved,index+2)});
    }
    const patchKeys=Object.keys(op.customer||{});
    const statusOnly=op.action==="updateCustomer"&&op.validationMode!=="full"&&patchKeys.length>0&&patchKeys.every(key=>["status","passbookStatus"].includes(key));
    if(op.statusOnly===true || statusOnly) {
      const keys=Object.keys(op.customer||{});
      if(op.action!=="updateCustomer"||!existing||!keys.length||keys.some(field=>{
        const allowed=field==="status"?["pending","active","inactive"]:field==="passbookStatus"?["pending","printed","delivered"]:[];
        return !allowed.includes(cleanValue(op.customer[field]).toLowerCase());
      }))throw new Error("Invalid status-only change.");
    }
    const passbookAction = op.action === "markPassbookPrinted" || op.action === "markPassbookDelivered";
    const customer = Object.assign(existing ? Object.assign(rowToCustomer(existing),photoMetadataFromRow(existing)) : {}, passbookAction ? {} : op.customer || {});
    if (op.action === "markPassbookPrinted") customer.passbookStatus = "PRINTED";
    if (op.action === "markPassbookDelivered") customer.passbookStatus = "DELIVERED";
    if (op.action === "saveCustomer" || (op.action === "updateCustomer"&&!statusOnly)) {
      const valid = value => !!cleanValue(value);
      const identityValid = valid(customer.name) && valid(customer.accountNo) && valid(customer.enrolId) && normalizeDigits(customer.uidaiNo).length === 12;
      if (!identityValid) throw new Error("Valid name, account number, customer ID and Aadhaar are required.");
    }
    if (op.action !== "deleteCustomer" && !statusOnly && !passbookAction) {
      const duplicate = duplicateErrorResponse(findDuplicates(customer, existing ? index+2 : null, authUser));
      if (duplicate) return duplicate;
    }
    if(customer.photoDataUrl && existing && cleanValue(existing[19]) && !preparedMedia) {
      // The row revision was validated under this lock. Replacing its tenant-
      // owned Drive file keeps the stable File ID and cannot create a duplicate.
      const fileId=extractDriveFileId(existing[19]);
      if(!fileId)throw new Error("The existing photo reference is invalid. No replacement was uploaded.");
      let metadata;
      try {metadata=photoDriveJson("files/"+encodeURIComponent(fileId),{fields:"id,mimeType,version,md5Checksum,parents,trashed",supportsAllDrives:true});}
      catch(error){if(!/\bHTTP 404\b/.test(String(error.message||"")))throw error;}
      // A verified stale URL has no file to replace. The normal operation-ID
      // upload below creates one photo; all other Drive failures remain pending.
      if(metadata){
        if(metadata.trashed||!(metadata.parents||[]).includes(authUser.photoFolderId))throw new Error("The original photo is outside this tenant's Drive folder. No replacement was uploaded.");
        const alreadyUploaded=sameDrivePhotoBytes(customer.photoDataUrl,metadata.md5Checksum);
        if(op.customer.photoVersion && String(metadata.version)!==String(op.customer.photoVersion) && !alreadyUploaded)
          return jsonResponse({success:false,code:"CONFLICT",message:"The photo changed on another device. Review before replacing it.",customer:syncCustomerObject(existing,index+2)});
        const media={photo:alreadyUploaded?{fileId,driveUrl:"https://drive.google.com/file/d/"+fileId+"/view"}:replaceBoundPhoto(customer.photoDataUrl,fileId,authUser.photoFolderId)};
        if(customer.pdfDataUrl)media.pdf=saveBoundDocument(customer.pdfDataUrl,customer.pdfFileName||customer.enrolId+".pdf",authUser.photoFolderId,op.operationId);
        preparedMedia=media;
      }
    }
    if ((customer.photoDataUrl || customer.pdfDataUrl) && !preparedMedia) {
      // Slow Drive writes must not hold the Sheet lock. Re-enter the operation
      // with the same UUID and re-check reset, tombstones, revision and duplicates
      // under a fresh lock before committing. Retry uses idempotent file names.
      lock.releaseLock();held=false;
      const media={};
      if(customer.photoDataUrl)media.photo=saveBoundDocument(customer.photoDataUrl,customer.enrolId+"-photo",authUser.photoFolderId,op.operationId);
      if(customer.pdfDataUrl)media.pdf=saveBoundDocument(customer.pdfDataUrl,customer.pdfFileName||customer.enrolId+".pdf",authUser.photoFolderId,op.operationId);
      return syncCustomerOperation(request,authUser,media);
    }
    if(preparedMedia && preparedMedia.photo){customer.photoUrl=preparedMedia.photo.driveUrl;customer.photoRemoved=false;}
    if(customer.photoRemoved===true)customer.photoUrl="";
    if(preparedMedia && preparedMedia.pdf)customer.pdfUrl=preparedMedia.pdf.driveUrl;
    customer.updatedBy = authUser.email;
    operations.push(op.operationId);
    if (JSON.stringify(operations).length > 45000) throw new Error("Operation history is full. Archive this record before further edits.");
    const entryTime=Number(op.createdAt);
    const createdAt=existing ? existing[21] : Number.isFinite(entryTime)&&entryTime>=946684800000&&entryTime<=Date.now() ? new Date(entryTime) : new Date();
    const row = customerToRow(customer, createdAt, new Date()).concat([op.recordId,JSON.stringify(operations),op.action === "deleteCustomer" ? "true" : ""]);
    const rowNumber = existing ? index+2 : sheet.getLastRow()+1;
    if (statusOnly || passbookAction) {
      for(const field of passbookAction?["passbookStatus"]:patchKeys)sheet.getRange(rowNumber,field==="status"?5:12,1,1).setValues([[customer[field]]]);
      sheet.getRange(rowNumber,26,1,1).setValues([[JSON.stringify(operations)]]);
    } else if (existing) sheet.getRange(rowNumber,1,1,27).setValues([row]); else sheet.appendRow(row);
    if((preparedMedia && preparedMedia.photo) || customer.photoRemoved===true){
      const headers=sheet.getRange(1,1,1,syncDataWidth(sheet)).getDisplayValues()[0];
      let column=headers.indexOf("BANKSETU PHOTO JSON")+1;
      if(!column){column=Math.max(27,sheet.getLastColumn?sheet.getLastColumn():sheet.getMaxColumns())+1;if(sheet.getMaxColumns()<column)sheet.insertColumnsAfter(sheet.getMaxColumns(),column-sheet.getMaxColumns());sheet.getRange(1,column,1,1).setValues([["BANKSETU PHOTO JSON"]]);}
      sheet.getRange(rowNumber,column,1,1).setValues([["PHOTO:"+JSON.stringify({photoRemoved:customer.photoRemoved===true,photoContentHash:customer.photoContentHash||""})]]);
    }
    SpreadsheetApp.flush();
    recordSyncChange(sheet,op.recordId,"UPSERT",op.operationId,authUser.connectionId);
    const saved = sheet.getRange(rowNumber,1,1,syncDataWidth(sheet)).getDisplayValues()[0];
    const action = op.action === "markPassbookPrinted" ? "PASSBOOK_PRINTED" : op.action === "markPassbookDelivered" ? "PASSBOOK_DELIVERED" : existing ? "UPDATE" : "CREATE";
    const details = action === "UPDATE" ? activityChanges(rowToCustomer(existing),customer) : action === "PASSBOOK_PRINTED" ? "Passbook print was requested." : action === "PASSBOOK_DELIVERED" ? "Passbook marked delivered." : "Customer record created.";
    try { recordActivity(authUser,action,customer,details); } catch (error) { console.error(error); }
    return jsonResponse({success:true,rowNumber,revision:syncRevision(saved),deleted:op.action === "deleteCustomer",driveDeleted:op.action === "deleteCustomer",customer:syncCustomerObject(saved,rowNumber)});
  } finally { if(held)lock.releaseLock(); }
}
function initializeClientWorkspace() {
  const spreadsheetId = getBankSetuScriptProperty("BANKSETU_CLIENT_SPREADSHEET_ID");
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName("Sheet1");
  if (!sheet) sheet = spreadsheet.insertSheet("Sheet1");
  const headers = sheet.getRange(1,1,1,24).getDisplayValues()[0];
  if (headers.some(Boolean) && !HEADERS.every((header,i)=>headers[i]===header)) throw new Error("Existing columns differ; no data was changed.");
  sheet.getRange(1,1,1,24).setValues([HEADERS]);
  ensureSyncMetadata(sheet);
  DriveApp.getFolderById(getBankSetuScriptProperty("BANKSETU_CLIENT_FOLDER_ID")).getName();
  UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {headers:{Authorization:"Bearer "+ScriptApp.getOAuthToken()}});
}

function fileBelongsToFolder(file, folderId) {
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
  return false;
}

function saveBoundDocument(dataUrl, fileName, folderId, operationId) {
  if (!/^[a-f0-9-]{36}$/i.test(operationId || "")) throw new Error("Document operation ID is required.");
  const match = String(dataUrl || "").match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Upload a valid PDF or image.");
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > MAX_PHOTO_SIZE) throw new Error("Document exceeds 5 MB.");
  const folder = DriveApp.getFolderById(folderId);
  const name = operationId + "-" + safeFileName(fileName || "document").slice(0,120);
  const previous = folder.getFilesByName(name);
  const file = previous.hasNext() ? previous.next() : folder.createFile(Utilities.newBlob(bytes,match[1],name));
  return {fileId:file.getId(),fileName:file.getName(),mimeType:match[1],driveUrl:"https://drive.google.com/file/d/"+file.getId()+"/view"};
}
function replaceBoundPhoto(dataUrl, fileId, folderId) {
  const match=String(dataUrl||"").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error("Upload a valid replacement image.");
  const bytes=Utilities.base64Decode(match[2]);
  if(bytes.length>MAX_PHOTO_SIZE)throw new Error("Replacement photo exceeds 5 MB.");
  // The caller verifies this file's tenant folder and revision while holding
  // the customer Sheet lock; a retry updates the same file, never creates one.
  const response=UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(fileId)+"?uploadType=media&supportsAllDrives=true",{
    method:"patch",contentType:match[1],payload:bytes,headers:{Authorization:"Bearer "+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error("Drive photo replacement failed (HTTP "+response.getResponseCode()+"). The customer operation remains pending.");
  const result=JSON.parse(response.getContentText());
  if(result.id!==fileId)throw new Error("Drive did not confirm the expected tenant photo file.");
  return {fileId,driveUrl:"https://drive.google.com/file/d/"+fileId+"/view"};
}
function sameDrivePhotoBytes(dataUrl, md5) {
  if(!md5)return false;
  const encoded=String(dataUrl||"").split(",")[1];if(!encoded)return false;
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,Utilities.base64Decode(encoded));
  return digest.map(byte=>(byte+256).toString(16).slice(-2)).join("").toLowerCase()===String(md5).toLowerCase();
}

function masterLocalConnectionId() {
 if(getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") || !LEGACY_SPREADSHEET_ID || !CUSTOMER_PHOTO_FOLDER_ID)return "";
 return "master-"+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,LEGACY_SPREADSHEET_ID+":"+CUSTOMER_PHOTO_FOLDER_ID).map(byte=>(byte+256).toString(16).slice(-2)).join("");
}

/* Durable tenant-folder photo index. Photo bytes stay in Drive; this hidden
   metadata tab is additive and never deletes customer rows or Drive files. */
function photoDriveJson(path, query) {
  const url="https://www.googleapis.com/drive/v3/"+path+"?"+Object.keys(query).map(key=>encodeURIComponent(key)+"="+encodeURIComponent(query[key])).join("&");
  const response=UrlFetchApp.fetch(url,{headers:{Authorization:"Bearer "+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  const status=response.getResponseCode();
  if(status===410)throw Object.assign(new Error("Photo change token expired."),{photoTokenExpired:true});
  // A 400 can mean a bad query, a permission change, or an expired page
  // token. Rebuilding the entire index is safe only for the last case.
  if(status===400&&query.pageToken){
    let reason="";try{const body=JSON.parse(response.getContentText());reason=String(body.error?.message||"");}catch(_){}
    if(/(?:page\s*token|pageToken).*(?:invalid|expired)|(?:invalid|expired).*(?:page\s*token|pageToken)/i.test(reason))
      throw Object.assign(new Error("Photo change token expired."),{photoTokenExpired:true});
  }
  if(status!==200)throw new Error("Drive photo metadata request failed (HTTP "+status+"). Photo checkpoint and customer queue remain saved.");
  return JSON.parse(response.getContentText());
}
function indexedPhotoCustomer(name) {
  const uploaded=/^[a-f0-9-]{36}-(.+)-photo$/i.exec(name||"");
  const legacy=/^(.+)\.(?:jpg|jpeg|png|webp)$/i.exec(name||"");
  return uploaded?uploaded[1]:legacy?legacy[1]:"";
}
function photoIndexEntry(file, revision, deleted, baseline) {
  return {fileId:file.id,customerId:indexedPhotoCustomer(file.name),url:"https://drive.google.com/file/d/"+file.id+"/view",version:String(file.version||file.md5Checksum||file.modifiedTime||""),hash:String(file.sha256Checksum||""),modifiedAt:String(file.modifiedTime||""),revision,deleted:!!deleted,baseline:baseline||""};
}
function getIncrementalPhotoIndex(request,authUser) {
  if(request.connectionId!==authUser.connectionId||!authUser.connectionId)return jsonResponse({success:false,code:"CONNECTION_CHANGED"});
  if(!authUser.photoFolderId)throw new Error("A verified tenant Drive folder is required.");
  const lock=LockService.getScriptLock();if(!acquireSyncLock(lock))return syncBusyResponse();
  try {
    const book=getSheet(authUser).getParent(),name="BANKSETU_PHOTO_INDEX";
    let tab=book.getSheetByName(name);
    if(!tab){tab=book.insertSheet(name);tab.getRange(1,1,1,2).setValues([["FILE ID","BANKSETU PHOTO METADATA V1"]]);if(tab.hideSheet)tab.hideSheet();}
    if(tab.getRange(1,1,1,2).getDisplayValues()[0].join("|")!=="FILE ID|BANKSETU PHOTO METADATA V1")throw new Error("Photo index tab name is in use. No existing data changed.");
    const raw=tab.getLastRow()>1?tab.getRange(2,1,1,2).getDisplayValues()[0][1]:"";
    const state=raw?JSON.parse(raw):{connectionId:authUser.connectionId,folderId:authUser.photoFolderId,revision:0,complete:false};
    if(state.connectionId!==authUser.connectionId||state.folderId!==authUser.photoFolderId)throw new Error("Photo index belongs to another workspace. No data changed.");
    if(!state.indexId)state.indexId=Utilities.getUuid();
    const entries=new Map();
    if(tab.getLastRow()>2)tab.getRange(3,1,tab.getLastRow()-2,2).getDisplayValues().forEach(row=>{if(row[0]&&row[1]){const entry=JSON.parse(row[1]);entries.set(row[0],entry);state.revision=Math.max(state.revision,entry.revision||0);}});
    let dirty=false;
    const update=(file,deleted)=>{
      const old=entries.get(file.id);
      const next=photoIndexEntry(file,state.revision+1,deleted,state.baseline);
      if(old&&old.version===next.version&&old.deleted===next.deleted&&old.customerId===next.customerId){if(state.baseline&&old.baseline!==state.baseline){old.baseline=state.baseline;dirty=true;}return;}
      state.revision++;entries.set(file.id,next);dirty=true;
    };
    if(!state.driveToken){state.driveToken=photoDriveJson("changes/startPageToken",{supportsAllDrives:true}).startPageToken;state.baseline=Utilities.getUuid();state.complete=false;state.pageToken="";}
    if(!state.complete){
      const query={q:"'"+authUser.photoFolderId.replace(/'/g,"\\'")+"' in parents and trashed = false and mimeType contains 'image/'",pageSize:1000,fields:"nextPageToken,files(id,name,mimeType,version,md5Checksum,sha256Checksum,modifiedTime,parents,trashed)",supportsAllDrives:true,includeItemsFromAllDrives:true};
      if(state.pageToken)query.pageToken=state.pageToken;
      let page;
      try{page=photoDriveJson("files",query);}catch(error){
        if(!error.photoTokenExpired)throw error;
        state.driveToken="";state.pageToken="";page={files:[],nextPageToken:"restart"};
      }
      (page.files||[]).forEach(file=>{if(/^image\//.test(file.mimeType||""))update(file,false);});
      state.pageToken=page.nextPageToken||"";
      if(!state.pageToken){
        state.complete=true;
        for(const entry of entries.values())if(entry.baseline!==state.baseline&&!entry.deleted){entry.deleted=true;entry.revision=++state.revision;dirty=true;}
      }
    }else{
      try{
        const page=photoDriveJson("changes",{pageToken:state.driveToken,pageSize:1000,fields:"nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,version,md5Checksum,sha256Checksum,modifiedTime,parents,trashed))",supportsAllDrives:true,includeItemsFromAllDrives:true});
        (page.changes||[]).forEach(change=>{
          const old=entries.get(change.fileId),file=change.file;
          if(!file){if(old&&change.removed&&!old.deleted){old.deleted=true;old.revision=++state.revision;dirty=true;}return;}
          const inFolder=(file.parents||[]).includes(authUser.photoFolderId)&&!file.trashed;
          if(inFolder&&/^image\//.test(file.mimeType||""))update(file,false);
          else if(old&&!old.deleted){old.deleted=true;old.revision=++state.revision;dirty=true;}
        });
        state.driveToken=page.nextPageToken||page.newStartPageToken||state.driveToken;
        state.changePaging=!!page.nextPageToken;
      }catch(error){
        if(!error.photoTokenExpired)throw error;
        state.driveToken="";state.complete=false;state.changePaging=false;
      }
    }
    const rows=[...entries.values()];
    if(dirty&&rows.length)tab.getRange(3,1,rows.length,2).setValues(rows.map(entry=>[entry.fileId,JSON.stringify(entry)]));
    tab.getRange(2,1,1,2).setValues([["STATE",JSON.stringify(state)]]);SpreadsheetApp.flush();
    const since=request.photoIndexId && request.photoIndexId!==state.indexId ? 0 : Number(request.photoRevision||0);
    if(!Number.isSafeInteger(since)||since<0)throw new Error("Invalid photo revision.");
    const changed=rows.filter(entry=>entry.revision>since).sort((a,b)=>a.revision-b.revision).slice(0,1000);
    const revision=changed.length?changed[changed.length-1].revision:state.revision;
    return jsonResponse({success:true,photoIndexVersion:1,indexId:state.indexId,connectionId:authUser.connectionId,revision,complete:state.complete&&!state.changePaging&&revision===state.revision,entries:changed});
  }finally{lock.releaseLock();}
}

function photoMetadataFromRow(row) {
 const encoded=row.slice(27).find(value=>typeof value==="string"&&value.indexOf("PHOTO:")===0);
 return encoded?JSON.parse(encoded.slice(6)):{};
}
