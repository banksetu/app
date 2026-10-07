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

    if (["syncCustomerOperation", "getCustomerPage", "getAllCustomers", "getCustomerByRowNumber", "markPassbookPrinted"].includes(action) || (action === "searchCustomer" && (getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") || request.masterLocalSync === true))) {
      const authUser = requireAuthorizedUser(idToken, false);
      if (action === "syncCustomerOperation") return syncCustomerOperation(request, authUser);
      if (action === "markPassbookPrinted") {
        if (authUser.tenantId && authUser.connectionId) return jsonResponse({success:false,code:"SYNC_REQUIRED",message:"Use the stable-ID sync operation for this workspace."});
        return markPassbookDelivered(request.rowNumber, authUser);
      }
      return localFirstRead(request, authUser);
    }

    if (action === "uploadBankFormatSample") {
      const admin = requireAuthorizedUser(idToken, true);
      if (admin.role !== "client_admin") throw new Error("Client Admin permission is required.");
      return jsonResponse(Object.assign({success:true}, saveBoundDocument(request.dataUrl, request.fileName, admin.photoFolderId, request.operationId)));
    }

    if (["saveCustomer","updateCustomer","deleteCustomer","markPassbookDelivered"].includes(action)) {
      const checked = requireAuthorizedUser(idToken, false);
      if (checked.tenantId && checked.connectionId) return jsonResponse({success:false,code:"SYNC_REQUIRED",message:"Use the stable-ID sync operation for this workspace."});
    }

    if (action === "getRecentActivities") {
      const authUser = requireAuthorizedUser(idToken, false);
      return getRecentActivities(authUser, request.limit);
    }

    if (action === "getDashboardStats") {
      const authUser = requireAuthorizedUser(idToken, false);
      return getDashboardStats(authUser);
    }

    if (action === "getBankFormatPreview") {
      const authUser = requireAuthorizedUser(idToken, false);
      return getBankFormatPreview(authUser, request.formatType);
    }

    if (action === "testTenantConnection") {
      const authUser = requireAuthorizedUser(idToken, false);
      return testTenantConnection(authUser);
    }


    if (
      action === "saveCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(
          idToken,
          false
        );

      return saveCustomer(
        request.customer || {},
        authUser
      );
    }


    if (
      action === "searchCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(
          idToken,
          false
        );

      return searchCustomer(
        request.query,
        authUser
      );
    }


    if (
      action === "updateCustomer"
    ) {
      const authUser =
        requireAuthorizedUser(
          idToken,
          false
        );

      return updateCustomer(
        request.rowNumber,
        request.customer || {},
        authUser
      );
    }


    if (
      action === "checkDuplicate"
    ) {
      const authUser = requireAuthorizedUser(
        idToken,
        false
      );

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
        requireAuthorizedUser(
          idToken,
          false
        );

      return markPassbookDelivered(
        request.rowNumber,
        authUser
      );
    }


    if (
      action === "deleteCustomer"
    ) {
      const admin =
        requireAuthorizedUser(
          idToken,
          true
        );

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
  adminRequired
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
      )
  };
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

    if (!photo) {
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

    recordActivity(authUser, "UPDATE", updatedCustomer, "Customer record updated.");


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


  /*
    पहले उसी Customer ID की कोई भी
    jpg/png/webp photo हटाएँ.
  */

  deletePhotosByCustomerId(customerId, photoFolderId);


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
function ensureSyncMetadata(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length + SYNC_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length + SYNC_HEADERS.length - sheet.getMaxColumns());
  const actual = sheet.getRange(1, 25, 1, 3).getDisplayValues()[0];
  if (actual.some((cell, i) => cell && cell !== SYNC_HEADERS[i])) throw new Error("Columns Y:AA are already in use. Sync migration stopped without overwriting them.");
  sheet.getRange(1, 25, 1, 3).setValues([SYNC_HEADERS]);
  const count = sheet.getLastRow() - 1;
  if (count > 0) {
    const meta = sheet.getRange(2, 25, count, 3).getValues();
    let changed = false;
    meta.forEach(row => { if (!row[0]) { row[0] = Utilities.getUuid(); changed = true; } });
    if (changed) sheet.getRange(2, 25, count, 3).setValues(meta);
  }
}
function syncRevision(row) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(row.slice(0, 24))).map(byte => (byte + 256).toString(16).slice(-2)).join("");
}
function syncCustomerObject(row, rowNumber) {
  return Object.assign(rowToCustomer(row), {recordId: String(row[24]), revision: syncRevision(row), rowNumber});
}
function localFirstRead(request, authUser) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sheet = getSheet(authUser); ensureSyncMetadata(sheet);
    if (["getCustomerPage","getAllCustomers"].includes(request.action)) {
      const deletions=syncDeletionRows(sheet,authUser.connectionId);
      const total=Math.max(0,sheet.getLastRow()-1);
      const size=Math.min(250,Math.max(1,Number(request.pageSize)||250));
      const cursor=request.action==="getCustomerPage"?Number(request.cursor||0):((Math.max(1,Number(request.page)||1)-1)*size);
      if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error("Invalid customer page cursor.");
      const count=Math.min(size,Math.max(0,total-cursor));
      const batch=count?sheet.getRange(cursor+2,1,count,27).getDisplayValues():[];
      const customers=batch.map((row,i)=>row[26]==="true"?null:syncCustomerObject(row,cursor+i+2)).filter(Boolean);
      const deletedIds=deletions.slice(cursor,cursor+size).map(row=>String(row[0])).concat(batch.filter(row=>row[26]==="true").map(row=>String(row[24])));
      const nextCursor=cursor+size;
      return jsonResponse({success:true,customers,deletedIds,nextCursor,hasNextPage:nextCursor<Math.max(total,deletions.length),totalRows:total});
    }
    const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow()-1, 27).getDisplayValues() : [];
    let customers = values.map((row, i) => row[26] === "true" ? null : syncCustomerObject(row, i+2)).filter(Boolean);
    if (request.action === "getAllCustomers") return jsonResponse({success:true,customers,fullSnapshot:true});
    if (request.action === "getCustomerByRowNumber") customers = customers.filter(customer => request.recordId ? customer.recordId === String(request.recordId) : customer.rowNumber === Number(request.rowNumber));
    else {
      const query = normalize(request.query);
      customers = query ? customers.filter(customer => ["enrolId","accountNo","name","pan","aofNo","contact","uidaiNo"].some(key => normalize(customer[key]).includes(query))) : [];
    }
    if (!customers.length) return jsonResponse({success:false,message:"Customer not found."});
    const customer = customers[0];
    if (customer.photoUrl) customer.photoPreview = getPhotoPreviewDataUrl(customer.photoUrl, authUser.photoFolderId);
    else {
      const photo = findPhotoByCustomerId(customer.enrolId, authUser.photoFolderId);
      if (photo) { customer.photoUrl = photo.driveUrl; customer.photoPreview = getPhotoPreviewFromFileId(photo.fileId, authUser.photoFolderId); }
    }
    customer.passbookDisplay = getPassbookDisplay(customer.passbookStatus);
    return jsonResponse({success:true,customer,rowNumber:customer.rowNumber,matches:customers,multipleMatches:customers.length>1});
  } finally { lock.releaseLock(); }
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

function syncCustomerOperation(request, authUser) {
  const op = request.operation || {};
  if (request.connectionId !== authUser.connectionId || !authUser.connectionId) return jsonResponse({success:false,code:"CONNECTION_CHANGED",message:"Workspace connection changed. Old queue remains on its original connection."});
  if (!/^[a-f0-9-]{36}$/i.test(op.recordId || "") || !/^[a-f0-9-]{36}$/i.test(op.operationId || "")) throw new Error("Invalid sync identity.");
  if (!["saveCustomer","updateCustomer","markPassbookPrinted","markPassbookDelivered","deleteCustomer"].includes(op.action)) throw new Error("Unsupported queued operation.");
  if (op.action === "deleteCustomer" && !["client_admin","master_owner","admin"].includes(authUser.role)) throw new Error("Administrator permission is required.");
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sheet = getSheet(authUser); ensureSyncMetadata(sheet);
    const rows = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,27).getDisplayValues() : [];
    const index = rows.findIndex(row => String(row[24]) === op.recordId);
    const existing = index >= 0 ? rows[index] : null;
    const deleted = syncDeletionRows(sheet,authUser.connectionId).find(row => row[0] === op.recordId);
    if (deleted) {
      if (op.action !== "deleteCustomer" || deleted[1] !== op.operationId) return jsonResponse({success:false,code:"CONFLICT",message:"This customer was already deleted."});
      if (existing) { deleteSyncedCustomerDriveFiles(existing, authUser); sheet.deleteRow(index+2); SpreadsheetApp.flush(); }
      return jsonResponse({success:true,replayed:true,deleted:true,driveDeleted:true,rowDeleted:true,recordId:op.recordId});
    }
    const operations = existing && existing[25] ? JSON.parse(existing[25]) : [];
    if (operations.includes(op.operationId)) {
      const wasDeleted = op.action === "deleteCustomer" && existing[26] === "true";
      if (wasDeleted) deleteSyncedCustomerDriveFiles(existing, authUser);
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
      return jsonResponse({success:true,deleted:true,driveDeleted:true,rowDeleted:true,recordId:op.recordId});
    }
    const customer = Object.assign(existing ? rowToCustomer(existing) : {}, op.customer || {});
    if (!cleanValue(customer.name) || !cleanValue(customer.accountNo) || !cleanValue(customer.enrolId) || normalizeDigits(customer.uidaiNo).length !== 12) throw new Error("Valid name, account number, customer ID and Aadhaar are required.");
    if (op.action !== "deleteCustomer") {
      const duplicate = duplicateErrorResponse(findDuplicates(customer, existing ? index+2 : null, authUser));
      if (duplicate) return duplicate;
    }
    if (customer.photoDataUrl && op.action !== "deleteCustomer") {
      const photo = saveBoundDocument(customer.photoDataUrl, customer.enrolId + "-photo", authUser.photoFolderId, op.operationId);
      customer.photoUrl = photo.driveUrl;
    }
    if (customer.pdfDataUrl && op.action !== "deleteCustomer") {
      const document = saveBoundDocument(customer.pdfDataUrl, customer.pdfFileName || customer.enrolId + ".pdf", authUser.photoFolderId, op.operationId);
      customer.pdfUrl = document.driveUrl;
    }
    customer.updatedBy = authUser.email;
    operations.push(op.operationId);
    if (JSON.stringify(operations).length > 45000) throw new Error("Operation history is full. Archive this record before further edits.");
    const row = customerToRow(customer, existing ? existing[21] : new Date(), new Date()).concat([op.recordId,JSON.stringify(operations),op.action === "deleteCustomer" ? "true" : ""]);
    const rowNumber = existing ? index+2 : sheet.getLastRow()+1;
    if (existing) sheet.getRange(rowNumber,1,1,27).setValues([row]); else sheet.appendRow(row);
    SpreadsheetApp.flush();
    const saved = sheet.getRange(rowNumber,1,1,27).getDisplayValues()[0];
    return jsonResponse({success:true,rowNumber,revision:syncRevision(saved),deleted:op.action === "deleteCustomer",driveDeleted:op.action === "deleteCustomer",customer:syncCustomerObject(saved,rowNumber)});
  } finally { lock.releaseLock(); }
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

function masterLocalConnectionId() {
 if(getBankSetuScriptProperty("BANKSETU_CLIENT_TENANT_ID") || !LEGACY_SPREADSHEET_ID || !CUSTOMER_PHOTO_FOLDER_ID)return "";
 return "master-"+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,LEGACY_SPREADSHEET_ID+":"+CUSTOMER_PHOTO_FOLDER_ID).map(byte=>(byte+256).toString(16).slice(-2)).join("");
}
