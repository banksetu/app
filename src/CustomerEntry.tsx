import { localDataFetch, getDataIdToken } from "./core/localData";
import {

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
import { getTenantApiUrl } from "./tenantApi";



import {

  getDocument,

  GlobalWorkerOptions,

} from "pdfjs-dist/legacy/build/pdf.mjs";



import type {

  PDFDocumentProxy,

} from "pdfjs-dist/legacy/build/pdf.mjs";



import pdfWorker from

  "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";



import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { isAssamBank, templateMatchesBank } from "./bankDocumentPolicy";
import { extractBankCustomer } from "./bankPdf";





/* =========================================================

   PDF WORKER

\========================================================= */



GlobalWorkerOptions.workerSrc =

  pdfWorker;





/* =========================================================

   TYPES

\========================================================= */



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

   CONSTANTS

\========================================================= */





/*

  Sample AOF PDF customer-photo location.



  Original sample page size:

  approx 595 x 842 PDF points.



  Customer photo rectangle:

  x ≈ 434.7

  y ≈ 184.5

  width ≈ 96

  height ≈ 120



  Ratios make crop scale-independent.

*/



const PDF_PHOTO_REGION = {

  x: 434.7 / 594.96,

  y: 184.5 / 841.92,

  width: 96 / 594.96,

  height: 120 / 841.92,

};





/* =========================================================

   TODAY - LOCAL COMPUTER DATE

\========================================================= */



function getTodayLocalDate() {

  const date =

    new Date();



  const year =

    date.getFullYear();



  const month =

    String(

      date.getMonth() + 1

    ).padStart(

      2,

      "0"

    );



  const day =

    String(

      date.getDate()

    ).padStart(

      2,

      "0"

    );



  return `${year}-${month}-${day}`;

}





/* =========================================================

   DEFAULT FORM

\========================================================= */



function createEmptyForm(): CustomerForm {

  return {

    aofNo: "",

    enrolId: "",

    accountNo: "",

    name: "",

    coName: "",

    nominee: "",

    gender: "",

    contact: "",



    status: "Active",



    accountOpeningDate:

      getTodayLocalDate(),



    address: "",

    postOffice: "",

    fullAddress: "",

    pinCode: "",

    pan: "",



    /*

      PDF Aadhaar intentionally

      NEVER auto-filled.

    */

    uidaiNo: "",



    dbtStatus: "Active",



    purposeOfAdvance:

      "NILL",



    passbookStatus:

      "Pending",

  };

}





/* =========================================================

   COMPONENT

\========================================================= */



function CustomerEntry({ bankName = "" }: { bankName?: string }) {

  const [form, setForm] =

    useState<CustomerForm>(

      createEmptyForm()

    );



  const [

    searchText,

    setSearchText,

  ] =

    useState("");



  const [

    message,

    setMessage,

  ] =

    useState("");



  const [

    messageType,

    setMessageType,

  ] =

    useState<

      "success" | "error" | "info"

    >("info");



  const [

    saving,

    setSaving,

  ] =

    useState(false);



  const [

    searching,

    setSearching,

  ] =

    useState(false);



  const [

    updating,

    setUpdating,

  ] =

    useState(false);



  const [

    extractingPdf,

    setExtractingPdf,

  ] =

    useState(false);



  const [

    deleteLoading,

    setDeleteLoading,

  ] =

    useState(false);



  const [

    loadedRowNumber,

    setLoadedRowNumber,

  ] =

    useState<number | null>(

      null

    );



  const [

    loadedPhotoUrl,

    setLoadedPhotoUrl,

  ] =

    useState("");



  const [

    photoPreview,

    setPhotoPreview,

  ] =

    useState("");



  const [

    photoDataUrl,

    setPhotoDataUrl,

  ] =

    useState("");



  const [

    photoFileName,

    setPhotoFileName,

  ] =

    useState("");





  const [

    selectedPdfName,

    setSelectedPdfName,

  ] =

    useState("");



  const [

    deleteModalOpen,

    setDeleteModalOpen,

  ] =

    useState(false);



  const [

    deletePassword,

    setDeletePassword,

  ] =

    useState("");



  const [

    deleteConfirmText,

    setDeleteConfirmText,

  ] =

    useState("");



  const photoInputRef =

    useRef<HTMLInputElement | null>(

      null

    );



  const pdfInputRef =

    useRef<HTMLInputElement | null>(

      null

    );





  const editMode =

    loadedRowNumber !== null;





  /* =========================================================

     FIELD CHANGE

  \========================================================= */



  const changeField = (

    field: keyof CustomerForm,

    value: string

  ) => {

    let finalValue =

      value;



    if (

      field === "uidaiNo" ||

      field === "contact" ||

      field === "pinCode"

    ) {

      finalValue =

        value.replace(

          /\D/g,

          ""

        );

    }



    if (

      field === "uidaiNo"

    ) {

      finalValue =

        finalValue.slice(

          0,

          12

        );

    }



    if (

      field === "contact"

    ) {

      finalValue =

        finalValue.slice(

          0,

          15

        );

    }



    if (

      field === "pinCode"

    ) {

      finalValue =

        finalValue.slice(

          0,

          10

        );

    }



    if (

      field === "pan"

    ) {

      finalValue =

        value.toUpperCase();

    }



    setForm(

      (previous) => ({

        ...previous,

        [field]:

          finalValue,

      })

    );

  };





  /* =========================================================

     API

  \========================================================= */



  const getApiUrl = () => {

    const apiUrl = getTenantApiUrl();



    if (!apiUrl) {

      throw new Error(

        "Google Sheet API is not configured. Open Advanced Administrator Control."

      );

    }



    return apiUrl;

  };





  const getFreshIdToken =

    async (

      forceRefresh = false

    ) => {

      const user =

        auth.currentUser;



      if (!user) {

        throw new Error(

          "Login session expired. Please login again."

        );

      }



      return getDataIdToken(forceRefresh);

    };





  const apiRequest =

    async <T,>(

      payload:

        Record<

          string,

          unknown

        >,

      forceFreshToken = false

    ): Promise<T> => {

      const apiUrl =

        getApiUrl();



      const idToken =

        await getFreshIdToken(

          forceFreshToken

        );



      const response =

        await localDataFetch(

          apiUrl,

          {

            method:

              "POST",



            headers: {

              "Content-Type":

                "text/plain;charset=utf-8",

            },



            body:

              JSON.stringify({

                ...payload,

                idToken,

              }),

          }

        );



      const text =

        await response.text();



      try {

        return JSON.parse(

          text

        ) as T;



      } catch {

        throw new Error(

          "Bank Setu API returned an invalid response."

        );

      }

    };





  /* =========================================================

     MANUAL PHOTO

  \========================================================= */



  const handlePhotoSelect = (

    event:

      ChangeEvent<HTMLInputElement>

  ) => {

    const file =

      event.target.files?.[0];



    if (!file) {

      return;

    }



    const allowedTypes = [

      "image/jpeg",

      "image/jpg",

      "image/png",

      "image/webp",

    ];



    if (

      !allowedTypes.includes(

        file.type

      )

    ) {

      showMessage(

        "Only JPG, PNG or WEBP photos are allowed.",

        "error"

      );



      event.target.value =

        "";



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



      event.target.value =

        "";



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

        "Customer photo selected.",

        "info"

      );

    };



    reader.readAsDataURL(

      file

    );



    event.target.value =

      "";

  };





  /* =========================================================

     PDF SELECT

  \========================================================= */



  const handlePdfSelect = async (

    event:

      ChangeEvent<HTMLInputElement>

  ) => {

    const file =

      event.target.files?.[0];



    if (!file) {

      return;

    }



    if (

      file.type !==

        "application/pdf" &&

      !file.name

        .toLowerCase()

        .endsWith(

          ".pdf"

        )

    ) {

      showMessage(

        "Please select a PDF file.",

        "error"

      );



      event.target.value =

        "";



      return;

    }



    if (file.size > 5 * 1024 * 1024) { showMessage("PDF must be smaller than 5 MB.", "error"); return; }

    setSelectedPdfName(

      file.name

    );



    setExtractingPdf(

      true

    );



    showMessage(

      "Reading PDF, extracting customer details and photo...",

      "info"

    );



    let importedPdfTask: ReturnType<typeof getDocument> | undefined;
    try {

      const buffer =

        await file.arrayBuffer();



      importedPdfTask = getDocument({ data: buffer });
      const pdf = await importedPdfTask.promise;






      /*

        TEXT

      */



      const text =

        await extractPdfText(

          pdf

        );





      let extractionMap: import("./bankFormatUtils").BankFieldPlacement[] = [];
      if (!isAssamBank(bankName)) {
        const tenantId = sessionStorage.getItem("bankSetuTenantId");
        if (tenantId) {
          const settings = await getDoc(doc(db, "tenantSettings", tenantId));
          const sample = settings.data()?.bankFormats?.accountOpening;
          if (templateMatchesBank(sample, bankName)) extractionMap = sample?.extractionMap || [];
        }
      }
      const extracted: Partial<CustomerForm> = { ...(isAssamBank(bankName) ? parseCustomerPdf(text) : {}), ...await extractBankCustomer(pdf, extractionMap, !isAssamBank(bankName)) };
      if (extracted.gender) extracted.gender = normalizeGender(extracted.gender);
      const extractedCount = Object.values(extracted).filter(value => String(value || "").trim()).length;
      const extractionMessage = extractedCount
        ? `${extractedCount} PDF fields extracted. Please check the values before saving. Aadhaar remains manual.`
        : "No customer values detected. For this bank, check Account Opening sample → Edit field layout. Scanned PDFs require manual entry.";





      /*

        PHOTO

        Render page 1 and crop

        fixed portrait position.

      */



      const extractedPhoto =

        await cropCustomerPhotoFromPdf(

          pdf

        );





      setForm(

        (previous) => ({

          ...previous,



          aofNo:

            extracted.aofNo ||

            previous.aofNo,



          enrolId:

            extracted.enrolId ||

            previous.enrolId,



          accountNo:

            extracted.accountNo ||

            previous.accountNo,



          name:

            extracted.name ||

            previous.name,



          coName:

            extracted.coName ||

            previous.coName,



          nominee:

            extracted.nominee ||

            previous.nominee,



          gender:

            extracted.gender ||

            previous.gender,



          contact:

            extracted.contact ||

            previous.contact,



          status:

            previous.status ||

            "Active",



          accountOpeningDate:

            extracted.accountOpeningDate || previous.accountOpeningDate ||

            getTodayLocalDate(),



          address:

            extracted.address ||

            previous.address,



          postOffice:

            extracted.postOffice ||

            previous.postOffice,



          fullAddress:

            extracted.fullAddress ||

            previous.fullAddress,



          pinCode:

            extracted.pinCode ||

            previous.pinCode,



          pan:

            extracted.pan ||

            previous.pan,



          /*

            NEVER import masked Aadhaar.

          */



          uidaiNo: "",



          dbtStatus:

            previous.dbtStatus ||

            "Active",



          purposeOfAdvance:

            previous.purposeOfAdvance ||

            "NILL",



          passbookStatus:

            previous.passbookStatus ||

            "Pending",

        })

      );





      if (

        extractedPhoto

      ) {

        setPhotoPreview(

          extractedPhoto

        );



        setPhotoDataUrl(

          extractedPhoto

        );



        const customerId =

          extracted.enrolId ||

          "customer";



        /*

          Backend finally saves photo

          using Customer ID filename.

        */



        setPhotoFileName(

          `${customerId}.jpg`

        );



        showMessage(

          `${extractionMessage} Photo crop prepared; please check it.`,

          "success"

        );



      } else {

        showMessage(

          `${extractionMessage} Photo crop could not be generated.`,

          "success"

        );

      }



    } catch (error) {

      console.error(

        error

      );



      showMessage(

        getErrorMessage(

          error

        ),

        "error"

      );



    } finally {
      if (importedPdfTask) await importedPdfTask.destroy();

      setExtractingPdf(

        false

      );



      event.target.value =

        "";

    }

  };





  /* =========================================================

     PDF TEXT

  \========================================================= */



  const extractPdfText =

    async (

      pdf: PDFDocumentProxy

    ) => {

      const pages: string[] =

        [];



      for (

        let pageNumber = 1;

        pageNumber <=

        pdf.numPages;

        pageNumber++

      ) {

        const page =

          await pdf.getPage(

            pageNumber

          );



        const content =

          await page.getTextContent();



        const pageText =

          content.items

            .map(

              (item) => {

                if (

                  "str" in item

                ) {

                  return item.str;

                }



                return "";

              }

            )

            .join(" ");



        pages.push(

          pageText

        );

      }



      return pages

        .join("\n")

        .replace(

          /\s+/g,

          " "

        )

        .trim();

    };





  /* =========================================================

     PDF PHOTO CROP

  \========================================================= */



  const cropCustomerPhotoFromPdf =

    async (

      pdf: PDFDocumentProxy

    ): Promise<string> => {

      if (

        pdf.numPages < 1

      ) {

        return "";

      }





      let region = PDF_PHOTO_REGION;
      let photoPage = 1;
      if (!isAssamBank(bankName)) {
        const tenantId = sessionStorage.getItem("bankSetuTenantId") || "";
        if (!tenantId) return "";
        const settings = (await getDoc(doc(db, "tenantSettings", tenantId))).data();
        const sample = settings?.bankFormats?.accountOpening;
        if (!templateMatchesBank(sample, bankName)) return "";
        const photo = sample.extractionMap?.find((field: { field: string }) => field.field === "customerPhoto");
        if (!photo) return "";
        photoPage = photo.page || 1;
        if (photoPage > pdf.numPages) return "";
        region = {x:photo.x/100,y:photo.y/100,width:photo.width/100,height:(photo.height || photo.width*0.8)/100};
      }

      const page =

        await pdf.getPage(

          photoPage

        );





      /*

        Higher render scale =

        sharper photo.

      */



      const scale =

        3;



      const viewport =

        page.getViewport({

          scale,

        });





      const pageCanvas =

        document.createElement(

          "canvas"

        );



      pageCanvas.width =

        Math.ceil(

          viewport.width

        );



      pageCanvas.height =

        Math.ceil(

          viewport.height

        );





      const pageContext =

        pageCanvas.getContext(

          "2d",

          {

            willReadFrequently:

              true,

          }

        );





      if (

        !pageContext

      ) {

        return "";

      }





      /*

        White base avoids

        transparent/black areas.

      */



      pageContext.fillStyle =

        "#ffffff";



      pageContext.fillRect(

        0,

        0,

        pageCanvas.width,

        pageCanvas.height

      );





      await page

        .render({

          canvasContext:

            pageContext,



          viewport,



          canvas:

            pageCanvas,

        })

        .promise;





      /*

        Crop using sample-PDF

        relative coordinates.

      */



      const cropX =

        Math.round(

          pageCanvas.width *

            region.x

        );



      const cropY =

        Math.round(

          pageCanvas.height *

            region.y

        );



      const cropWidth =

        Math.round(

          pageCanvas.width *

            region.width

        );



      const cropHeight =

        Math.round(

          pageCanvas.height *

            region.height

        );





      if (

        cropWidth <= 0 ||

        cropHeight <= 0

      ) {

        return "";

      }





      const photoCanvas =

        document.createElement(

          "canvas"

        );





      /*

        Keep original photo

        proportion while giving

        enough pixels for Drive.

      */



      const outputScale =

        2;



      photoCanvas.width =

        cropWidth *

        outputScale;



      photoCanvas.height =

        cropHeight *

        outputScale;





      const photoContext =

        photoCanvas.getContext(

          "2d"

        );





      if (

        !photoContext

      ) {

        return "";

      }





      photoContext.imageSmoothingEnabled =

        true;



      photoContext.imageSmoothingQuality =

        "high";





      photoContext.drawImage(

        pageCanvas,



        cropX,

        cropY,

        cropWidth,

        cropHeight,



        0,

        0,

        photoCanvas.width,

        photoCanvas.height

      );





      /*

        JPEG keeps Drive payload

        much smaller than PNG.

      */



      return photoCanvas.toDataURL(

        "image/jpeg",

        0.92

      );

    };





  /* =========================================================

     PDF PARSER

  \========================================================= */



  const parseCustomerPdf = (

    rawText: string

  ): Partial<CustomerForm> => {

    const text =

      rawText

        .replace(

          /\s+/g,

          " "

        )

        .trim();





    /* AOF */



    const aofNo =

      firstMatch(

        text,

        [

          /Reference\s*No\.?\s*([A-Z0-9]+)/i,



          /Reference\s*Number\s*([A-Z0-9]+)/i,

        ]

      );





    /* NAME */



    const name =

      firstMatch(

        text,

        [

          /Customer\s*Name\s+(.+?)\s+Sex\b/i,



          /Customer\s*Name\s*[:-]?\s*([A-Za-z][A-Za-z .'-]+?)(?=\s+(?:Sex|Gender)\b)/i,

        ]

      );





    /* GENDER */



    let gender =

      firstMatch(

        text,

        [

          /\bSex\s+(Male|Female|Other)\b/i,



          /\bGender\s+(Male|Female|Other)\b/i,

        ]

      );



    gender =

      normalizeGender(

        gender

      );





    /* ACCOUNT */



    const accountNo =

      firstMatch(

        text,

        [

          /Account\s*No\.?\s*([A-Z0-9]+)/i,

        ]

      );





    /* CUSTOMER ID */



    const enrolId =

      firstMatch(

        text,

        [

          /Customer\s*ID\s*([A-Z0-9]+)/i,



          /Customer\s*Id\s*[:-]?\s*([A-Z0-9]+)/i,

        ]

      );





    /* MOBILE */



    const contact =

      firstMatch(

        text,

        [

          /Mobile\s*No\.?\s*(\d{10,15})/i,



          /Tel\.?\s*No\.?\s*\/?\s*Fax\s*No\.?.*?(\d{10})/i,

        ]

      ).replace(

        /\D/g,

        ""

      );





    /* FULL ADDRESS */



    let fullAddress =

      firstMatch(

        text,

        [

          /Flat\s*No\.?\/Bldg\.?\s*Name\s+(.+?)\s+Street\s*\/\s*Road\s*\/\s*Locality/i,



          /Flat\s*No\.?\/Bldg\.?\s*Name\s+(.+?)\s+City\s*\/\s*District\s*\/\s*State/i,

        ]

      );





    fullAddress =

      cleanExtractedText(

        fullAddress

      );





    /* C/O */



    let coName =

      firstMatch(

        fullAddress ||

          text,

        [

          /C\/O\s*[:-]\s*([^,]+)/i,



          /C\/O\s+([^,]+)/i,

        ]

      );





    if (

      !coName

    ) {

      coName =

        firstMatch(

          text,

          [

            /Name\s*of\s*Father\s*\/\s*Guardian\s+(.+?)\s+Marital\s*Status/i,

          ]

        );

    }





    coName =

      cleanExtractedText(

        coName

      );





    /* VILLAGE */



    let address =

      firstMatch(

        fullAddress ||

          text,

        [

          /Vill(?:age)?\s*[-:]\s*([^,]+)/i,



          /Vill(?:age)?\s+([^,]+)/i,

        ]

      );





    address =

      cleanExtractedText(

        address

      );





    /* POST OFFICE */



    let postOffice =

      firstMatch(

        fullAddress ||

          text,

        [

          /P\.?\s*O\.?\s*[-:]\s*([^,]+)/i,



          /Post\s*Office\s*[-:]\s*([^,]+)/i,

        ]

      );





    postOffice =

      cleanExtractedText(

        postOffice

      );





    /* PIN */



    let pinCode =

      "";





    if (

      fullAddress

    ) {

      const matches =

        fullAddress.match(

          /\b\d{6}\b/g

        );



      if (

        matches &&

        matches.length

      ) {

        pinCode =

          matches[

            matches.length -

              1

          ];

      }

    }





    if (

      !pinCode

    ) {

      const match =

        text.match(

          /\b([1-9][0-9]{5})\b/

        );



      if (

        match

      ) {

        pinCode =

          match[1];

      }

    }





    /* NOMINEE */



    const nominee =

      extractNominee(

        text

      );





    /* PAN */



    const panMatch =

      text.match(

        /\b[A-Z]{5}[0-9]{4}[A-Z]\b/

      );





    const pan =

      panMatch

        ? panMatch[0]

        : "";





    return {

      aofNo:

        cleanExtractedText(

          aofNo

        ),



      enrolId:

        cleanExtractedText(

          enrolId

        ),



      accountNo:

        cleanExtractedText(

          accountNo

        ),



      name:

        cleanExtractedText(

          name

        ),



      coName,



      nominee,



      gender,



      contact,



      address,



      postOffice,



      fullAddress,



      pinCode,



      pan,



      uidaiNo: "",

    };

  };





  /* =========================================================

     NOMINEE PARSER

  \========================================================= */



  const extractNominee = (

    text: string

  ) => {

    const relationships = [

      "MOTHER",

      "FATHER",

      "WIFE",

      "HUSBAND",

      "SON",

      "DAUGHTER",

      "BROTHER",

      "SISTER",

      "GRANDMOTHER",

      "GRANDFATHER",

      "GRANDSON",

      "GRANDDAUGHTER",

      "UNCLE",

      "AUNT",

      "NEPHEW",

      "NIECE",

      "OTHER",

    ].join("|");





    const directPattern =

      new RegExp(

        `nominee\\.?\\s+([A-Z][A-Z .'-]{1,60}?)\\s+(${relationships})\\b`,

        "i"

      );





    const direct =

      text.match(

        directPattern

      );





    if (

      direct &&

      direct[1]

    ) {

      return cleanNomineeName(

        direct[1]

      );

    }





    const fallbackPattern =

      new RegExp(

        `\\b([A-Z][A-Z.'-]*(?:\\s+[A-Z][A-Z.'-]*){0,3})\\s+(${relationships})\\b`,

        "i"

      );





    const fallback =

      text.match(

        fallbackPattern

      );





    if (

      fallback &&

      fallback[1]

    ) {

      return cleanNomineeName(

        fallback[1]

      );

    }





    return "";

  };





  /* =========================================================

     PARSER HELPERS

  \========================================================= */



  const firstMatch = (

    text: string,

    patterns: RegExp[]

  ) => {

    for (

      const pattern of

      patterns

    ) {

      const match =

        text.match(

          pattern

        );



      if (

        match &&

        match[1]

      ) {

        return match[1];

      }

    }



    return "";

  };





  const cleanExtractedText = (

    value: string

  ) => {

    return value

      .replace(

        /\s+/g,

        " "

      )

      .replace(

        /^[,;:\-\s]+/,

        ""

      )

      .replace(

        /[,;:\-\s]+$/,

        ""

      )

      .trim();

  };





  const cleanNomineeName = (

    value: string

  ) => {

    return cleanExtractedText(

      value

    )

      .replace(

        /^OF\s+/i,

        ""

      )

      .replace(

        /^THE\s+/i,

        ""

      )

      .trim();

  };





  const normalizeGender = (

    value: string

  ) => {

    const gender =

      value

        .trim()

        .toLowerCase();



    if (

      gender === "male"

    ) {

      return "Male";

    }



    if (

      gender === "female"

    ) {

      return "Female";

    }



    if (

      gender === "other"

    ) {

      return "Other";

    }



    return "";

  };





  /* =========================================================

     VALIDATION

  \========================================================= */



  const validateForm = () => {

    if (

      !form.name.trim()

    ) {

      showMessage(

        "Customer Name is required.",

        "error"

      );



      return false;

    }





    if (

      !form.accountNo.trim()

    ) {

      showMessage(

        "Account Number is required.",

        "error"

      );



      return false;

    }





    if (

      !form.enrolId.trim()

    ) {

      showMessage(

        "Customer ID is required.",

        "error"

      );



      return false;

    }





    if (

      form.uidaiNo.length !==

      12

    ) {

      showMessage(

        "UIDAI / Aadhaar Number must contain exactly 12 digits. Please enter it manually.",

        "error"

      );



      return false;

    }





    return true;

  };





  /* =========================================================

     SAVE

  \========================================================= */



  const saveCustomer =

    async () => {

      if (

        !validateForm()

      ) {

        return;

      }





      if (

        editMode

      ) {

        showMessage(

          "Existing customer loaded. Use Update Customer.",

          "error"

        );



        return;

      }





      setSaving(

        true

      );





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





        if (

          !result.success

        ) {

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





        clearFormOnly();



      } catch (error) {

        showMessage(

          getErrorMessage(

            error

          ),

          "error"

        );



      } finally {

        setSaving(

          false

        );

      }

    };





  /* =========================================================

     SEARCH

  \========================================================= */



  const searchCustomer =

    async () => {

      const query =

        searchText.trim();





      if (

        !query

      ) {

        showMessage(

          "Enter customer search value.",

          "error"

        );



        return;

      }





      setSearching(

        true

      );





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

            customer.aofNo ||

            "",



          enrolId:

            customer.enrolId ||

            "",



          accountNo:

            customer.accountNo ||

            "",



          name:

            customer.name ||

            "",



          coName:

            customer.coName ||

            "",



          nominee:

            customer.nominee ||

            "",



          gender:

            customer.gender ||

            "",



          contact:

            customer.contact ||

            "",



          status:

            customer.status ||

            "Active",



          accountOpeningDate:

            normalizeDateForInput(

              customer.accountOpeningDate

            ) ||

            getTodayLocalDate(),



          address:

            customer.address ||

            "",



          postOffice:

            customer.postOffice ||

            "",



          fullAddress:

            customer.fullAddress ||

            "",



          pinCode:

            customer.pinCode ||

            "",



          pan:

            customer.pan ||

            "",



          uidaiNo:

            customer.uidaiNo ||

            "",



          dbtStatus:

            customer.dbtStatus ||

            "Active",



          purposeOfAdvance:

            customer.purposeOfAdvance ||

            "NILL",



          passbookStatus:

            customer.passbookStatus ||

            "Pending",

        });





        setLoadedRowNumber(

          result.rowNumber

        );





        setLoadedPhotoUrl(

          customer.photoUrl ||

          ""

        );





        setPhotoPreview(

          customer.photoPreview ||

          ""

        );





        setPhotoDataUrl(

          ""

        );





        setPhotoFileName(

          ""

        );





        showMessage(

          "Customer loaded successfully.",

          "success"

        );



      } catch (error) {

        showMessage(

          getErrorMessage(

            error

          ),

          "error"

        );



      } finally {

        setSearching(

          false

        );

      }

    };





  /* =========================================================

     UPDATE

  \========================================================= */



  const updateCustomer =

    async () => {

      if (

        !loadedRowNumber

      ) {

        return;

      }





      if (

        !validateForm()

      ) {

        return;

      }





      const confirmed =

        window.confirm(

          `Update customer "${form.name}"?`

        );





      if (

        !confirmed

      ) {

        return;

      }





      setUpdating(

        true

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




              photoDataUrl,



              photoFileName,



              photoUrl:

                loadedPhotoUrl,

            },

          });





        if (

          !result.success

        ) {

          showMessage(

            result.message ||

              "Update failed.",

            "error"

          );



          return;

        }





        showMessage(

          "Customer updated successfully.",

          "success"

        );





        setPhotoDataUrl(

          ""

        );





        setPhotoFileName(

          ""

        );



      } catch (error) {

        showMessage(

          getErrorMessage(

            error

          ),

          "error"

        );



      } finally {

        setUpdating(

          false

        );

      }

    };





  /* =========================================================

     DELETE

  \========================================================= */



  const deleteCustomer =

    async () => {

      if (

        !loadedRowNumber

      ) {

        return;

      }





      if (

        !deletePassword

      ) {

        showMessage(

          "Enter administrator password.",

          "error"

        );



        return;

      }





      if (

        deleteConfirmText

          .trim()

          .toUpperCase() !==

        "DELETE CUSTOMER"

      ) {

        showMessage(

          'Type "DELETE CUSTOMER".',

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

          "Administrator login session not found.",

          "error"

        );



        return;

      }





      setDeleteLoading(

        true

      );





      try {

        const credential =

          EmailAuthProvider

            .credential(

              user.email,

              deletePassword

            );





        await reauthenticateWithCredential(

          user,

          credential

        );





        const freshToken =

          await user.getIdToken(

            true

          );





        const apiUrl =

          getApiUrl();





        const response =

          await localDataFetch(

            apiUrl,

            {

              method:

                "POST",



              headers: {

                "Content-Type":

                  "text/plain;charset=utf-8",

              },



              body:

                JSON.stringify({

                  action:

                    "deleteCustomer",



                  rowNumber:

                    loadedRowNumber,



                  idToken:

                    freshToken,

                }),

            }

          );





        const result =

          (await response.json()) as ApiResponse;





        if (

          !result.success

        ) {

          showMessage(

            result.message ||

              "Delete failed.",

            "error"

          );



          return;

        }





        setDeleteModalOpen(

          false

        );





        clearFormOnly();





        setSearchText(

          ""

        );





        showMessage(

          "Customer deleted successfully.",

          "success"

        );



      } catch (error) {

        console.error(

          error

        );



        showMessage(

          "Administrator verification failed or delete permission denied.",

          "error"

        );



      } finally {

        setDeleteLoading(

          false

        );



        setDeletePassword(

          ""

        );



        setDeleteConfirmText(

          ""

        );

      }

    };





  /* =========================================================

     NEW / CLEAR

  \========================================================= */



  const startNewCustomer =

    () => {

      clearFormOnly();



      setSearchText(

        ""

      );



      showMessage(

        "New Customer mode ready.",

        "info"

      );

    };





  const clearFormOnly =

    () => {

      setForm(

        createEmptyForm()

      );



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





  const showMessage = (

    text: string,

    type:

      | "success"

      | "error"

      | "info"

  ) => {

    setMessage(

      text

    );



    setMessageType(

      type

    );

  };





  /* =========================================================

     UI

  \========================================================= */



  return (

    <div className="customer-entry-wrapper" style={styles.wrapper}>

    <div className="customer-entry-title">Customer Data Entry Form</div>

<section

        className="customer-top-grid"

        style={styles.topGrid}

      >



        {/* SEARCH */}



        <div style={styles.toolCard}>

          <p style={styles.cardLabel}>

            CUSTOMER SEARCH

          </p>



          <h2 style={styles.toolTitle}>

            Find Customer

          </h2>



          <p

            style={

              styles.toolDescription

            }

          >

            Account No, Customer ID,

            Aadhaar, Mobile, Name,

            PAN or AOF No.

          </p>



          <div style={styles.searchRow}>

            <input

              type="text"

              value={searchText}

              placeholder="Search customer..."

              style={

                styles.searchInput

              }

              onChange={(event) =>

                setSearchText(

                  event.target.value

                )

              }

              onKeyDown={(event) => {

                if (

                  event.key ===

                  "Enter"

                ) {

                  searchCustomer();

                }

              }}

            />



            <button

              type="button"

              style={

                styles.searchButton

              }

              onClick={

                searchCustomer

              }

              disabled={searching}

            >

              {searching

                ? "Searching..."

                : "Search"}

            </button>

          </div>

        </div>





        {/* PHOTO */}



        <div className="customer-photo-card" style={styles.photoCard}>

          <p style={styles.cardLabel}>

            CUSTOMER PHOTO

          </p>



          <div className="customer-photo-area" style={styles.photoArea}>

            {photoPreview ? (

              <img

                src={photoPreview}

                alt="Customer"

                style={

                  styles.photoImage

                }

              />

            ) : (

              <div

                style={

                  styles.photoPlaceholder

                }

              >

                <span

                  style={

                    styles.photoIcon

                  }

                >

                  👤

                </span>



                <span>

                  No Photo

                </span>

              </div>

            )}

          </div>



          <button

            type="button"

            style={

              styles.smallButton

            }

            onClick={() =>

              photoInputRef

                .current

                ?.click()

            }

          >

            {photoPreview

              ? "Change Photo"

              : "Upload Photo"}

          </button>



          <input

            ref={photoInputRef}

            type="file"

            accept="image/jpeg,image/png,image/webp"

            style={{

              display: "none",

            }}

            onChange={

              handlePhotoSelect

            }

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



          <p

            style={

              styles.toolDescription

            }

          >

            Select Account Opening

            Form PDF to auto-fill

            details and crop customer

            photo.

          </p>



          <button

            type="button"

            style={

              styles.pdfButton

            }

            onClick={() =>

              pdfInputRef

                .current

                ?.click()

            }

            disabled={

              extractingPdf

            }

          >

            {extractingPdf

              ? "⏳ Reading PDF..."

              : "📄 Select PDF & Auto Fill"}

          </button>



          {selectedPdfName && (

            <div

              style={

                styles.pdfName

              }

            >

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

            onChange={

              handlePdfSelect

            }

          />

        </div>

      </section>





      {/* MESSAGE */}



      {message && (

        <div

          style={{

            ...styles.message,



            ...(messageType ===

            "success"

              ? styles.successMessage

              : {}),



            ...(messageType ===

            "error"

              ? styles.errorMessage

              : {}),



            ...(messageType ===

            "info"

              ? styles.infoMessage

              : {}),

          }}

        >

          {message}

        </div>

      )}





      {/* FORM */}



      <section className="customer-form-card" style={styles.formCard}>

<div className="customer-form-grid" style={styles.formGrid}>

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

              "Active",

              "Inactive",

              "Pending",

              "Closed",

            ]}

          />



          <Field

            label="A/C OPENING DATE"

            value={

              form.accountOpeningDate

            }

            type="date"

            onChange={(value) =>

              changeField(

                "accountOpeningDate",

                value

              )

            }

          />



          <Field

            label="ADDRESS / VILLAGE"

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

            value={

              form.postOffice

            }

            onChange={(value) =>

              changeField(

                "postOffice",

                value

              )

            }

          />





          {/* FULL ADDRESS BIG BOX */}



          <TextAreaField

            label="FULL ADDRESS"

            value={

              form.fullAddress

            }

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

            value={

              form.dbtStatus

            }

            onChange={(value) =>

              changeField(

                "dbtStatus",

                value

              )

            }

            options={[

              "Active",

              "Inactive",

              "Pending",

              "Not Available",

            ]}

          />



          <Field

            label="PURPOSE OF ADVANCE"

            value={

              form.purposeOfAdvance

            }

            onChange={(value) =>

              changeField(

                "purposeOfAdvance",

                value

              )

            }

          />



          <SelectField

            label="PASS BOOK STATUS"

            value={

              form.passbookStatus

            }

            onChange={(value) =>

              changeField(

                "passbookStatus",

                value

              )

            }

            options={[

              "Pending",

              "Printed",

              "Delivered",

              "Not Required",

            ]}

          />

        </div>





        <div

          className="customer-action-buttons"

          style={

            styles.formActions

          }

        >

          {!editMode && (

            <button

              type="button"

              style={

                styles.saveButton

              }

              onClick={

                saveCustomer

              }

              disabled={

                saving

              }

            >

              {saving

                ? "Saving..."

                : "✓ Save Customer"}

            </button>

          )}





          {editMode && (

            <>

              <button

                type="button"

                style={

                  styles.updateButton

                }

                onClick={

                  updateCustomer

                }

                disabled={

                  updating

                }

              >

                {updating

                  ? "Updating..."

                  : "✓ Update Customer"}

              </button>



              <button

                type="button"

                style={

                  styles.deleteButton

                }

                onClick={() =>

                  setDeleteModalOpen(

                    true

                  )

                }

              >

                🗑 Delete Customer

              </button>



              <button

                type="button"

                style={

                  styles.cancelEditButton

                }

                onClick={

                  startNewCustomer

                }

              >

                ＋ New Customer

              </button>

            </>

          )}

        </div>

      </section>





      {/* DELETE MODAL */}



      {deleteModalOpen && (

        <div

          style={

            styles.modalOverlay

          }

        >

          <div

            style={

              styles.deleteModal

            }

          >

            <h2

              style={

                styles.deleteTitle

              }

            >

              Delete Customer

            </h2>



            <p

              style={

                styles.deleteWarning

              }

            >

              Administrator

              authentication is

              required.

            </p>



            <label

              style={

                styles.label

              }

            >

              Current Admin Password

            </label>



            <input

              type="password"

              value={

                deletePassword

              }

              style={

                styles.input

              }

              onChange={(event) =>

                setDeletePassword(

                  event.target.value

                )

              }

            />



            <label

              style={

                styles.label

              }

            >

              Type DELETE CUSTOMER

            </label>



            <input

              type="text"

              value={

                deleteConfirmText

              }

              style={

                styles.input

              }

              onChange={(event) =>

                setDeleteConfirmText(

                  event.target.value

                )

              }

            />



            <div

              style={

                styles.modalActions

              }

            >

              <button

                type="button"

                style={

                  styles.finalDeleteButton

                }

                onClick={

                  deleteCustomer

                }

                disabled={

                  deleteLoading

                }

              >

                {deleteLoading

                  ? "Deleting..."

                  : "Delete Permanently"}

              </button>



              <button

                type="button"

                style={

                  styles.modalCancelButton

                }

                onClick={() =>

                  setDeleteModalOpen(

                    false

                  )

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

          .customer-entry-title {
          margin: 0 0 14px;
          text-align: center;
          color: #ffffff;
          font-size: 22px;
          line-height: 1.25;
          font-weight: 800;
        }

        @media (max-width: 900px) {

            .customer-top-grid {

              grid-template-columns:

                1fr 1fr !important;

            }

          }



          @media (max-width: 760px) {
          .customer-entry-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-x: hidden !important;
          }

          .customer-entry-title {
            margin: 0 0 12px !important;
            text-align: center !important;
            color: #ffffff !important;
            font-size: 20px !important;
            line-height: 1.25 !important;
            font-weight: 800 !important;
          }

          .customer-top-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            margin-bottom: 12px !important;
          }

          .customer-form-card {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding: 14px !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .customer-form-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
            width: 100% !important;
            min-width: 0 !important;
          }

          .customer-field,
          .customer-full-address {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          .customer-form-control {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          .customer-action-buttons {
            flex-direction: column !important;
          }

          .customer-action-buttons button {
            width: 100% !important;
          }
        }

        @media (max-width: 420px) {
          .customer-form-card {
            padding: 11px !important;
            border-radius: 14px !important;
          }

          .customer-top-grid > div {
            min-width: 0 !important;
            max-width: 100% !important;
          }
        }

        `}

      </style>

    </div>

  );

}





/* =========================================================

   NORMAL FIELD

\========================================================= */



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

  onChange:

    (value: string) => void;

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

    <label className="customer-field" style={styles.field}>

      <span

        style={

          styles.label

        }

      >

        {label}



        {required && (

          <span

            style={

              styles.required

            }

          >

            {" "}*

          </span>

        )}

      </span>



      <input

        type={type}

        value={value}

        inputMode={

          inputMode

        }

        style={

          styles.input

        }

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

   FULL ADDRESS MULTILINE

\========================================================= */



function TextAreaField({

  label,

  value,

  onChange,

}: {

  label: string;

  value: string;

  onChange:

    (value: string) => void;

}) {

  return (

    <label className="customer-field customer-full-address" style={styles.fullAddressField}>

      <span

        style={

          styles.label

        }

      >

        {label}

      </span>



      <textarea

        value={value}

        rows={3}

        style={

          styles.textarea

        }

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

   SELECT

\========================================================= */



function SelectField({

  label,

  value,

  onChange,

  options,

}: {

  label: string;

  value: string;

  onChange:

    (value: string) => void;

  options: string[];

}) {

  return (

    <label className="customer-field" style={styles.field}>

      <span

        style={

          styles.label

        }

      >

        {label}

      </span>



      <select

        value={value}

        style={

          styles.select

        }

        onChange={(event) =>

          onChange(

            event.target.value

          )

        }

      >

        {options.map(

          (option) => (

            <option

              key={

                option ||

                "__empty"

              }

              value={

                option

              }

            >

              {option ||

                "Select"}

            </option>

          )

        )}

      </select>

    </label>

  );

}





/* =========================================================

   DATE NORMALIZER

\========================================================= */



function normalizeDateForInput(

  value?: string

) {

  if (

    !value

  ) {

    return "";

  }





  const clean =

    value.trim();





  if (

    /^\d{4}-\d{2}-\d{2}$/.test(

      clean

    )

  ) {

    return clean;

  }





  const match =

    clean.match(

      /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

    );





  if (

    match

  ) {

    const day =

      match[1].padStart(

        2,

        "0"

      );



    const month =

      match[2].padStart(

        2,

        "0"

      );



    const year =

      match[3];



    return `${year}-${month}-${day}`;

  }





  return "";

}





/* =========================================================

   ERROR

\========================================================= */



function getErrorMessage(

  error: unknown

) {

  if (

    error instanceof Error

  ) {

    return error.message;

  }



  return String(

    error

  );

}





/* =========================================================

   STYLES

\========================================================= */



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

    fontSize: "9px",

    fontWeight: 900,

    letterSpacing: "1.8px",

  },



  heading: {

    margin: "6px 0",

    color: "#ffffff",

    fontSize: "29px",

    fontWeight: 800,

  },



  subtitle: {

    margin: 0,

    color: "#91a7b3",

    fontSize: "11px",

  },



  modeBar: {

    display: "flex",

    justifyContent:

      "space-between",

    alignItems: "center",

    gap: "14px",

    padding: "14px 17px",

    borderRadius: "13px",

    marginBottom: "16px",

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

    marginTop: "4px",

    color: "#a2b5be",

    fontSize: "9px",

  },



  newCustomerButton: {

    height: "38px",

    padding: "0 14px",

    borderRadius: "9px",

    border:

      "1px solid rgba(55,220,195,0.16)",

    background:

      "rgba(55,220,195,0.07)",

    color: "#4be1c7",

    cursor: "pointer",

    fontWeight: 800,

  },



  topGrid: {

    display: "grid",

    gridTemplateColumns:

      "1.35fr 0.75fr 0.9fr",

    gap: "14px",

    marginBottom: "16px",

  },



  toolCard: {

    minHeight: "185px",

    padding: "18px",

    boxSizing: "border-box",

    borderRadius: "17px",

    border:

      "1px solid rgba(255,255,255,0.06)",

    background:

      "linear-gradient(145deg,rgba(9,35,46,0.88),rgba(11,42,54,0.82))",

  },



  photoCard: {

    minHeight: "185px",

    padding: "14px",

    boxSizing: "border-box",

    textAlign: "center",

    borderRadius: "17px",

    border:

      "1px solid rgba(55,220,195,0.11)",

    background:

      "linear-gradient(145deg,rgba(9,38,48,0.88),rgba(10,48,60,0.82))",

  },



  cardLabel: {

    margin: 0,

    color: "#45dfc5",

    fontSize: "8px",

    fontWeight: 900,

    letterSpacing: "1.4px",

  },



  toolTitle: {

    margin: "6px 0",

    color: "#fff",

    fontSize: "18px",

    fontWeight: 800,

  },



  toolDescription: {

    minHeight: "30px",

    color: "#94a9b4",

    fontSize: "9px",

    lineHeight: 1.5,

  },



  searchRow: {

    display: "flex",

    gap: "8px",

  },



  searchInput: {

    flex: 1,

    minWidth: 0,

    height: "44px",

    padding: "0 13px",

    boxSizing: "border-box",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.07)",

    outline: "none",

    background: "#0a303c",

    color: "#ffffff",

    fontSize: "13px",

    fontWeight: 700,

  },



  searchButton: {

    minWidth: "90px",

    height: "44px",

    border: "none",

    borderRadius: "10px",

    background:

      "linear-gradient(90deg,#34dcbf,#2faade)",

    color: "#032229",

    fontWeight: 900,

    cursor: "pointer",

  },



  photoArea: {

    width: "105px",

    height: "135px",

    margin: "8px auto",

    display: "flex",

    justifyContent: "center",

    alignItems: "center",

    overflow: "hidden",

    borderRadius: "12px",

    background: "#071d27",

    border:

      "1px dashed rgba(55,220,195,0.15)",

  },



  photoImage: {

    width: "100%",

    height: "100%",

    objectFit: "cover",

  },



  photoPlaceholder: {

    display: "flex",

    flexDirection: "column",

    alignItems: "center",

    gap: "4px",

    color: "#718b98",

    fontSize: "9px",

  },



  photoIcon: {

    fontSize: "30px",

  },



  smallButton: {

    width: "105px",

    maxWidth: "100%",

    height: "34px",

    border: "none",

    borderRadius: "9px",

    background:

      "rgba(55,220,195,0.10)",

    color: "#4be1c7",

    cursor: "pointer",

    fontWeight: 800,

  },



  pdfButton: {

    width: "100%",

    height: "44px",

    border:

      "1px dashed rgba(55,220,195,0.22)",

    borderRadius: "10px",

    background:

      "rgba(55,220,195,0.045)",

    color: "#48dfc5",

    cursor: "pointer",

    fontWeight: 800,

  },



  pdfName: {

    marginTop: "8px",

    color: "#afc0c8",

    fontSize: "9px",

    fontWeight: 700,

    wordBreak: "break-all",

  },



  message: {

    marginBottom: "16px",

    padding: "13px 15px",

    borderRadius: "11px",

    fontSize: "10px",

    fontWeight: 700,

    lineHeight: 1.5,

  },



  successMessage: {

    background:

      "rgba(55,220,195,0.07)",

    color: "#4be2c8",

  },



  errorMessage: {

    background:

      "rgba(255,80,80,0.07)",

    color: "#ff9898",

  },



  infoMessage: {

    background:

      "rgba(66,153,225,0.07)",

    color: "#8cc5ff",

  },



  formCard: {

    padding: "23px",

    borderRadius: "18px",

    background:

      "linear-gradient(145deg,rgba(9,35,46,0.88),rgba(11,42,54,0.82))",

    border:

      "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(12px)",

  },



  formHeading: {

    textAlign: "center",

    marginBottom: "21px",

  },



  formTitle: {

    margin: "6px 0",

    color: "#fff",

    fontSize: "20px",

    fontWeight: 800,

  },



  formGrid: {

    display: "grid",

    gridTemplateColumns:

      "repeat(auto-fit,minmax(220px,1fr))",

    gap: "15px",

    alignItems: "start",

  },



  field: {

    display: "flex",

    flexDirection: "column",

    gap: "7px",

  },



  /*

    Full address gets more room.

    On wider screens it spans

    two grid columns.

  */



  fullAddressField: {

    display: "flex",

    flexDirection: "column",

    gap: "7px",

    gridColumn:

      "span 2",

  },



  label: {

    color: "#d8e4e9",

    fontSize: "10px",

    fontWeight: 800,

  },



  required: {

    color: "#ff8888",

  },



  input: {

    width: "100%",

    height: "46px",

    boxSizing: "border-box",

    padding: "0 13px",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.075)",

    outline: "none",

    background: "#0a303c",

    color: "#ffffff",

    fontSize: "13px",

    fontWeight: 700,

    letterSpacing: "0.15px",

  },



  /*

    Larger multi-line address box.

    Long address automatically wraps.

  */



  textarea: {

    width: "100%",

    minHeight: "92px",

    boxSizing: "border-box",

    padding: "12px 13px",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.075)",

    outline: "none",

    resize: "vertical",

    background: "#0a303c",

    color: "#ffffff",

    fontSize: "13px",

    fontWeight: 700,

    lineHeight: 1.55,

    fontFamily:

      "inherit",

    whiteSpace:

      "pre-wrap",

    overflowWrap:

      "anywhere",

  },



  select: {

    width: "100%",

    height: "46px",

    boxSizing: "border-box",

    padding: "0 13px",

    borderRadius: "10px",

    border:

      "1px solid rgba(255,255,255,0.075)",

    outline: "none",

    background: "#0a303c",

    color: "#ffffff",

    fontSize: "13px",

    fontWeight: 700,

  },



  formActions: {

    display: "flex",

    gap: "10px",

    flexWrap: "wrap",

    marginTop: "23px",

  },



  saveButton: {

    minWidth: "180px",

    height: "47px",

    border: "none",

    borderRadius: "11px",

    background:

      "linear-gradient(90deg,#35dcbf,#2eaade)",

    color: "#032329",

    fontSize: "11px",

    fontWeight: 900,

    cursor: "pointer",

  },



  updateButton: {

    minWidth: "180px",

    height: "47px",

    border: "none",

    borderRadius: "11px",

    background:

      "linear-gradient(90deg,#37dfc3,#35a7f1)",

    color: "#032329",

    fontWeight: 900,

    cursor: "pointer",

  },



  deleteButton: {

    minWidth: "165px",

    height: "47px",

    borderRadius: "11px",

    border:

      "1px solid rgba(255,80,80,0.17)",

    background:

      "rgba(255,80,80,0.055)",

    color: "#ff9494",

    fontWeight: 800,

    cursor: "pointer",

  },



  cancelEditButton: {

    minWidth: "145px",

    height: "47px",

    borderRadius: "11px",

    border:

      "1px solid rgba(255,255,255,0.08)",

    background:

      "rgba(255,255,255,0.035)",

    color: "#c5d4db",

    fontWeight: 800,

    cursor: "pointer",

  },



  modalOverlay: {

    position: "fixed",

    inset: 0,

    zIndex: 5000,

    display: "flex",

    justifyContent: "center",

    alignItems: "center",

    padding: "20px",

    background:

      "rgba(0,0,0,0.72)",

    backdropFilter:

      "blur(7px)",

  },



  deleteModal: {

    width: "100%",

    maxWidth: "500px",

    padding: "22px",

    boxSizing: "border-box",

    borderRadius: "19px",

    background: "linear-gradient(145deg, #ffffff 0%, #f4f1ff 48%, #edf7ff 100%)",

    border:

      "1px solid rgba(108,92,231,0.22)",

    boxShadow: "0 24px 70px rgba(44,36,100,0.28)",

  },



  deleteTitle: {

    color: "#2d2457",

    fontSize: "21px",

  },



  deleteWarning: {

    color: "#b4233d",

    fontSize: "10px",

    fontWeight: 700,

  },



  modalActions: {

    display: "flex",

    gap: "9px",

    marginTop: "15px",

  },



  finalDeleteButton: {

    flex: 1,

    height: "44px",

    border: "none",

    borderRadius: "10px",

    background: "#c83f4c",

    color: "#fff",

    fontWeight: 800,

    cursor: "pointer",

  },



  modalCancelButton: {

    minWidth: "100px",

    height: "44px",

    borderRadius: "10px",

    border: "1px solid #d9dbe7",

    background: "#eef0f7",

    color: "#34344c",

    fontWeight: 800,

    cursor: "pointer",

  },

};





export default CustomerEntry;
