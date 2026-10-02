import { useEffect } from "react";

const pageStyle = {
  minHeight: "100vh",
  background: "#f5f6fb",
  color: "#303246",
  padding: "28px 16px 56px",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle = {
  width: "min(900px, 100%)",
  margin: "0 auto",
  padding: "clamp(22px, 5vw, 52px)",
  borderRadius: 20,
  background: "#fff",
  boxShadow: "0 18px 55px rgba(45, 48, 83, .09)",
  lineHeight: 1.7,
};

const linkStyle = { color: "#6452d8", fontWeight: 650 };

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header style={{ borderBottom: "1px solid #ececf3", paddingBottom: 22, marginBottom: 26 }}>
    <a href="/" style={{ ...linkStyle, textDecoration: "none" }}>← Bank Setu sign in</a>
    <p style={{ margin: "25px 0 7px", color: "#7563df", fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>{eyebrow}</p>
    <h1 style={{ margin: 0, color: "#25263b", fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.15 }}>{title}</h1>
    <p style={{ margin: "12px 0 0", color: "#6f7187", fontSize: 16 }}>{description}</p>
  </header>;
}

function PageFooter() {
  return <footer style={{ borderTop: "1px solid #ececf3", marginTop: 36, paddingTop: 20, color: "#77798d", fontSize: 13 }}>
    <p>Bank Setu · Effective date: October 2, 2026</p>
    <p><a href="/about" style={linkStyle}>About Bank Setu</a> · <a href="/privacy-policy" style={linkStyle}>Privacy Policy</a> · <a href="mailto:banksetu2026@gmail.com" style={linkStyle}>Contact support</a></p>
  </footer>;
}

function AboutPage() {
  useEffect(() => { document.title = "About Bank Setu"; }, []);
  return <main style={pageStyle}><article style={cardStyle}>
    <PageHeader eyebrow="BANK SETU" title="About Bank Setu" description="A workspace for bank and CSP administrators to manage customer records, documents, and day-to-day service activity." />
    <h2>What Bank Setu does</h2>
    <p>Bank Setu provides customer entry, search, dashboard, passbook, reporting, and account-opening document tools for approved administrators. Each Client Admin connects their own Google Account to create a dedicated Google Drive folder and Google Sheet for that client workspace.</p>
    <h2>Client workspaces and data</h2>
    <p>Client customer records are stored in the Client Admin’s connected Google Sheet. Customer photos and related files are stored in the connected Drive folder. The Client Admin controls workspace access and is responsible for authorizing staff and entering information they are permitted to process.</p>
    <h2>Google Account access</h2>
    <p>When a Client Admin connects Google, Bank Setu requests access to the specific Drive files created and used by the app. The app does not request general access to browse the user’s entire Drive. The connected workspace folder is also shared with the designated Bank Setu Apps Script deployment account so that customer records can be saved, searched, and updated.</p>
    <p>Bank Setu uses Google API data only to provide the workspace features the user requests, and handles that data in accordance with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={linkStyle}>Google API Services User Data Policy</a>, including its Limited Use requirements. Google Account data is not sold, used for advertising, or used to train generalized AI or machine-learning models.</p>
    <h2>Contact</h2>
    <p>For product or privacy questions, contact <a href="mailto:banksetu2026@gmail.com" style={linkStyle}>banksetu2026@gmail.com</a>.</p>
    <PageFooter />
  </article></main>;
}

function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | Bank Setu";
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = "Bank Setu Privacy Policy explains what account, customer, and Google Workspace data the service processes, how it is used, stored, shared, and deleted.";
  }, []);

  return <main style={pageStyle}><article style={cardStyle}>
    <PageHeader eyebrow="BANK SETU · LEGAL" title="Privacy Policy" description="How Bank Setu handles account information, customer records, and data from a connected Google Account." />
    <p><strong>Effective date:</strong> October 2, 2026</p>
    <p>This Privacy Policy applies to the Bank Setu web application at <a href="https://banksetu-app.web.app/" style={linkStyle}>banksetu-app.web.app</a> and related Bank Setu services. It explains what information is processed, why it is processed, where it is stored, and the choices available to users.</p>

    <h2>1. Who uses Bank Setu</h2>
    <p>Bank Setu is an administrator workspace used by a Master Admin, Client Admins, and authorized client users. A Client Admin manages a separate client workspace and decides which authorized staff can use it. Client Admins are responsible for ensuring that customer information they enter is accurate and that they have authority to process it.</p>

    <h2>2. Information processed</h2>
    <ul>
      <li><strong>Account and access information:</strong> name, email address, Firebase account identifier, role, approval/subscription status, and client workspace identifier. Password authentication is handled by Firebase Authentication; Bank Setu does not store a readable copy of a user’s password.</li>
      <li><strong>Workspace setup information:</strong> bank/CSP name, bank format, branch name, CSP code, operator name, address, workspace settings, and the Google email address selected for connection.</li>
      <li><strong>Customer records entered by workspace users:</strong> customer or enrolment ID, account number, customer and guardian/parent names, status, gender, contact details, account opening date, address, nominee, post office, passbook information, Aadhaar/UIDAI number, DBT status, purpose of advance, PIN code, PAN, AOF number, and record creation/update details.</li>
      <li><strong>Customer files:</strong> customer photos and PDFs or other files selected for Bank Setu workflows. These are placed in the client’s connected Google Drive workspace.</li>
      <li><strong>Activity records:</strong> actions such as creating, updating, or deleting a customer record, the user who performed the action, the time, and limited customer identifiers used in the activity log.</li>
      <li><strong>Technical information:</strong> information generated by Firebase, Google, Cloudflare, and the browser to authenticate requests, prevent misuse, and keep the service operating.</li>
    </ul>
    <p>Bank Setu does not ask users to provide online banking passwords, card PINs, one-time passwords (OTPs), or net-banking credentials. Users should enter government ID or financial details only when necessary and authorized.</p>

    <h2>3. Google Account and Google API data</h2>
    <p>When a Client Admin chooses to connect Google, Bank Setu requests the Google Account email and the <code>openid</code>, <code>email</code>, and <code>https://www.googleapis.com/auth/drive.file</code> permissions used by the current app. The Drive permission is used to create and manage the Bank Setu folder and Sheet that the user initiates, verify those files, and support customer-data workflows. Bank Setu does not use this permission to browse a user’s entire Drive.</p>
    <p>The short-lived Google access token is sent securely to the Bank Setu service for workspace verification and configuration. Bank Setu does not store that token as a persistent account or customer record. The connected Google email and workspace file identifiers are stored with the client’s workspace settings.</p>
    <p>To operate the client workspace, the selected Drive folder is shared with the designated Bank Setu Apps Script deployment account with writer access. The Apps Script service uses that folder and its Sheet to save, search, update, and delete customer records and related files. A Client Admin can review or remove this sharing permission in Google Drive; removing it will stop the corresponding Bank Setu workspace functions.</p>
    <p><strong>Google API Limited Use:</strong> Bank Setu’s use of information received from Google APIs is limited to providing or improving user-facing features that are visible in Bank Setu. Google API data is not sold, used for advertising, or used to train generalized AI or machine-learning models. It is not transferred except as needed to provide the requested features, protect security, comply with law, or with the user’s consent. Human access is limited to cases permitted by Google’s policy, such as the user’s explicit consent, security, or legal requirements. See the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={linkStyle}>Google API Services User Data Policy</a>.</p>

    <h2>4. How information is used</h2>
    <ul>
      <li>Authenticate accounts and enforce administrator approval, roles, and client-workspace access.</li>
      <li>Create and maintain each Client Admin’s separate Google Drive folder and Sheet.</li>
      <li>Provide customer entry, search, update, deletion, dashboard, passbook, reporting, and document-generation features.</li>
      <li>Maintain activity history, protect the service, troubleshoot failures, and prevent unauthorized access.</li>
      <li>Respond to support requests and comply with applicable legal obligations.</li>
    </ul>
    <p>Bank Setu does not sell personal information or Google Account data.</p>

    <h2>5. Where information is stored</h2>
    <p>Firebase Authentication and Firestore are used for account profiles and workspace settings. Client customer records, activity history, photos, and related documents are stored in the connected client-owned Google Sheet and Drive folder. The Bank Setu Apps Script service reads or writes the specific workspace files needed for the requested feature. Browser storage may keep workspace-scoped preferences and operational settings on the user’s device.</p>
    <p>Firebase/Google, Cloudflare, and Google Apps Script provide infrastructure used to operate the service. These providers process information as needed to provide their services. Data may be processed in locations where those providers operate, subject to their terms and settings.</p>

    <h2>6. How information is shared</h2>
    <p>Customer and workspace data is available to the Client Admin and authorized users assigned to that same client workspace, according to their roles. It is also processed by the infrastructure providers described above and by the designated Apps Script deployment account for the features the client requested. Bank Setu does not sell or rent customer records or Google API data. Information may also be disclosed where required by law or where necessary to protect the security of users and the service.</p>

    <h2>7. Retention and deletion</h2>
    <p>Account profiles and workspace settings are retained while needed to operate the account, enforce access, resolve disputes, maintain security, or comply with law. Client Admins control customer records in their workspace and can use Bank Setu’s delete function for individual records; that function also removes the linked customer photo and PDF where the app can identify them. Activity history may remain in the workspace audit sheet.</p>
    <p>Removing a Client Admin’s Bank Setu account revokes that account’s access, but does not automatically delete the client-owned Google Drive folder or Sheet. Those files remain in the client’s Google Drive until their owner deletes them. The Drive owner can delete the files directly in Google Drive. A user may also revoke Bank Setu’s Google Account connection from their Google Account security settings; any separate folder-sharing permission for the Apps Script deployment account should also be reviewed in Drive.</p>
    <p>For account or personal-data requests, contact the Client Admin who manages the relevant workspace or email <a href="mailto:banksetu2026@gmail.com" style={linkStyle}>banksetu2026@gmail.com</a>. We may need to verify the requester’s identity and authority before acting.</p>

    <h2>8. Security</h2>
    <p>Bank Setu uses authenticated requests, role checks, tenant separation, and provider security controls to limit access. No internet service or storage method can be guaranteed completely secure. Users should protect their login credentials, sign out on shared devices, and promptly report suspected unauthorized access.</p>

    <h2>9. Children and customer records</h2>
    <p>Bank Setu is an administrative business tool, not a service for children to create personal accounts. A Client Admin or authorized staff member may enter a customer record that includes a guardian’s details where their work requires it. The client organization is responsible for providing required notices and obtaining any permissions needed before entering customer information.</p>

    <h2>10. Changes and contact</h2>
    <p>We may update this Policy when the service or data practices change. The updated version and effective date will be published on this page. Material changes affecting Google Account data will be disclosed before Bank Setu uses that data for a new purpose.</p>
    <p><strong>Privacy contact:</strong> <a href="mailto:banksetu2026@gmail.com" style={linkStyle}>banksetu2026@gmail.com</a></p>

    <hr style={{ border: 0, borderTop: "1px solid #ececf3", margin: "34px 0" }} />
    <h2>हिन्दी में गोपनीयता नीति</h2>
    <p><strong>प्रभावी तारीख:</strong> 2 अक्टूबर 2026</p>
    <p>Bank Setu बैंक/CSP प्रशासकों के लिए ग्राहक रिकॉर्ड, खोज, रिपोर्ट और दस्तावेज़ संबंधी कार्यक्षेत्र है। Client Admin अपना Google खाता जोड़कर अपना अलग Drive फ़ोल्डर और Sheet बनाता है।</p>
    <p><strong>कौन-सी जानकारी:</strong> लॉगिन ईमेल, नाम, भूमिका और workspace पहचान; बैंक/शाखा/CSP और ऑपरेटर विवरण; ग्राहक का नाम, ग्राहक ID, खाता संख्या, संपर्क, पता, nominee, Aadhaar/UIDAI, PAN, DBT तथा AOF विवरण; ग्राहक की फोटो/PDF; और रिकॉर्ड बनाने, बदलने या हटाने का सीमित activity log। पासवर्ड Firebase संभालता है—Bank Setu उसे पढ़ने योग्य रूप में नहीं रखता। ऐप बैंकिंग पासवर्ड, PIN या OTP नहीं माँगता।</p>
    <p><strong>Google का उपयोग:</strong> Google जोड़ने पर ऐप ईमेल पहचानता है और `drive.file` अनुमति से उपयोगकर्ता द्वारा बनाए गए Bank Setu फ़ोल्डर/Sheet को बनाता और चलाता है। ऐप पूरे Drive को browse नहीं करता। अस्थायी access token workspace जाँच के लिए भेजा जाता है और स्थायी रूप से store नहीं किया जाता। चलाने के लिए चुना गया फ़ोल्डर Bank Setu के Apps Script deployment account के साथ साझा होता है।</p>
    <p><strong>स्टोरेज और साझा करना:</strong> खाते और workspace settings Firebase में रहते हैं। ग्राहक डेटा, activity log, फोटो और संबंधित फाइल Client Admin के Google Sheet/Drive में रहते हैं। उसी workspace के अधिकृत users और सेवा चलाने वाले Google/Firebase/Cloudflare providers इन्हें आवश्यकतानुसार process कर सकते हैं। Bank Setu Google data या ग्राहक डेटा बेचता नहीं है, उसका विज्ञापन के लिए उपयोग नहीं करता और उससे सामान्य AI models को train नहीं करता। Google API data का उपयोग Google की <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={linkStyle}>Limited Use नीति</a> के अनुसार सीमित है।</p>
    <p><strong>हटाना और नियंत्रण:</strong> Client Admin ग्राहक रिकॉर्ड हटाने का अनुरोध/कार्रवाई कर सकता है; ऐप जुड़े हुए फोटो/PDF भी पहचानने पर हटाता है। Audit activity log रह सकता है। Client Admin का Bank Setu access हटाने पर उसके Drive की Sheet/फोल्डर अपने-आप delete नहीं होते; उनका owner उन्हें Drive से हटा सकता है। Google access revoke करने के साथ Drive में Apps Script account की sharing permission भी जाँचें। अनुरोध के लिए अपने Client Admin से संपर्क करें या <a href="mailto:banksetu2026@gmail.com" style={linkStyle}>banksetu2026@gmail.com</a> पर लिखें।</p>
    <p><strong>सुरक्षा:</strong> Bank Setu authentication, role checks और अलग-अलग client workspaces का उपयोग करता है, फिर भी internet पर कोई व्यवस्था पूर्ण सुरक्षा की गारंटी नहीं देती। ग्राहक जानकारी दर्ज करने की अनुमति और आवश्यक notice/consent सुनिश्चित करना Client Admin की जिम्मेदारी है।</p>
    <p>बदलाव होने पर नई नीति इसी सार्वजनिक पेज पर तारीख सहित प्रकाशित होगी।</p>
    <PageFooter />
  </article></main>;
}

export default function PublicPages() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/privacy-policy" ? <PrivacyPolicyPage /> : <AboutPage />;
}
