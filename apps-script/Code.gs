const SPREADSHEET_ID =
  "1x0T_sjjLt0CThkB10gkbyzk1T92G3Jnp2l13goSlWpA";

const SHEET_NAME = "Sheet1";

const CUSTOMER_PHOTO_FOLDER_ID =
  "1W58RbBsPpoVnnnd84iMudFaZKBBXzJO4";

const FIREBASE_PROJECT_ID =
  "banksetu-69e2f";

const FIREBASE_API_KEY =
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
          "Bank Setu API is running"
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
      requireAuthorizedUser(
        idToken,
        false
      );

      return checkDuplicate(
        request.customer || {},
        request.excludeRowNumber
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


    /*
      SMART SYNC: lightweight change-marker probe.
      Lets idle devices reconcile with ONE cheap call per hour
      instead of downloading full customer pages repeatedly.
    */
    if (
      action === "getSyncStatus"
    ) {
      requireAuthorizedUser(
        idToken,
        false
      );

      return getSyncStatus(
        cleanValue(
          request.lastKnownMarker
        )
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


  if (
    adminRequired &&
    role !== "admin"
  ) {
    throw new Error(
      "Administrator permission is required."
    );
  }


  return {
    uid,
    email:
      cleanValue(
        authAccount.email ||
        profile.email
      ),
    role,
    status,
    subscriptionStatus
  };
}


/* =========================================================
   FIREBASE TOKEN VERIFY
========================================================= */

function verifyFirebaseIdToken(
  idToken
) {
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

    email:
      firestoreString(
        document,
        "email"
      )
  };
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
        null
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
          enrolId
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
          enrolId
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
      getSheet();


    sheet.appendRow(
      customerToRow(
        customerForSheet,
        now,
        now
      )
    );


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
    getSheet();


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
        row
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
          enrolId
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
          enrolId
        );
    }


    /*
      फिर current Customer ID से
      folder lookup.
    */

    if (!photo) {
      photo =
        findPhotoByCustomerId(
          enrolId
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
    getSheet();

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
          customerId
        );


      if (drivePhoto) {
        customer.photoUrl =
          drivePhoto.driveUrl;

        customer.photoPreview =
          getPhotoPreviewFromFileId(
            drivePhoto.fileId
          );
      } else {
        /*
          पुराने records में अगर केवल PHOTO URL है
          तो fallback.
        */

        customer.photoPreview =
          getPhotoPreviewDataUrl(
            customer.photoUrl
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
  customerId
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

  deletePhotosByCustomerId(
    customerId
  );


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
      CUSTOMER_PHOTO_FOLDER_ID
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
  customerId
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
      CUSTOMER_PHOTO_FOLDER_ID
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
  newCustomerId
) {
  const oldPhoto =
    findPhotoByCustomerId(
      oldCustomerId
    );


  if (!oldPhoto) {
    return null;
  }


  /*
    अगर new ID के नाम से पहले से photo
    मौजूद है तो उसे पहले trash करेंगे.
  */

  deletePhotosByCustomerId(
    newCustomerId
  );


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
  customerId
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
      CUSTOMER_PHOTO_FOLDER_ID
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
  fileId
) {
  try {
    if (!fileId) {
      return "";
    }


    const blob =
      DriveApp
        .getFileById(
          fileId
        )
        .getBlob();


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
  photoUrl
) {
  const fileId =
    extractDriveFileId(
      photoUrl
    );


  if (!fileId) {
    return "";
  }


  return getPhotoPreviewFromFileId(
    fileId
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
    admin.role !== "admin"
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
    getSheet();


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


  /*
    Customer ID based photo delete.
  */

  deletePhotosByCustomerId(
    customerId
  );


  /*
    PDF cleanup अभी पुरानी URL method से.
  */

  const pdfId =
    extractDriveFileId(
      pdfUrl
    );


  if (pdfId) {
    safeTrashDriveFile(
      pdfId
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
    getSheet();


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
  excludeRowNumber
) {
  const duplicate =
    findDuplicates(
      customer,
      Number(
        excludeRowNumber
      ) || null
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
  excludeRowNumber
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
    getSheet();


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
  fileId
) {
  try {
    DriveApp
      .getFileById(
        fileId
      )
      .setTrashed(
        true
      );

  } catch (error) {
    console.error(
      error
    );
  }
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function getSheet() {
  const spreadsheet =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
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


  return sheet;
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
   SMART SYNC — LIGHTWEIGHT CHANGE MARKER
   One cheap probe per idle device per hour instead of full
   sheet downloads. Uses script cache to avoid hammering the
   Sheets API when many devices poll around the same time.
========================================================= */
function getSyncStatus(
  lastKnownMarker
) {
  const cache =
    CacheService.getScriptCache();
  const CACHE_KEY = "syncMarkerV1";
  let marker =
    cache.get(CACHE_KEY);

  if (!marker) {
    const sheet =
      getSheet();
    /*
      Marker = row count + last-edit fingerprint.
      Cheap: two metadata reads, no data download.
    */
    const lastRow =
      sheet.getLastRow();
    const updated =
      SpreadsheetApp.getActiveSpreadsheet()
        .getLastUpdatedDate()
        .getTime();
    marker = String(
      lastRow
    ) + "-" + String(
      updated
    );
    /*
      CacheService values must be <= 127 chars — fine here.
    */
    cache.put(
      CACHE_KEY,
      marker,
      60
    );
  }

  return jsonResponse({
    success: true,
    marker:
      marker,
    changed:
      String(
        lastKnownMarker || ""
      ) !== marker,
  });
}

/* =========================================================
   SMART SYNC — SERVER-SIDE IDEMPOTENCY GUARD
   Prevents duplicate "saveCustomer" executions when a client
   retries an upload that actually succeeded on the server but
   whose response was lost (offline / Apps Script timeout).
========================================================= */
function alreadyProcessed(
  opId
) {
  if (!opId) return false;
  const cache =
    CacheService.getScriptCache();
  const key =
    "op-" + String(
      opId
    ).slice(0, 40);
  if (cache.get(key)) {
    return true;
  }
  cache.put(
    key,
    "1",
    900
  );
  return false;
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
      CUSTOMER_PHOTO_FOLDER_ID
    );

  Logger.log(
    folder.getName()
  );
}


function authorizeBankSetuDriveWrite() {
  const folder =
    DriveApp.getFolderById(
      CUSTOMER_PHOTO_FOLDER_ID
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
      CUSTOMER_PHOTO_FOLDER_ID
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