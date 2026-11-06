import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeLayoutTemplate,normalizedBankKey} from "../cloudflare/layoutTemplates.js";

const item=(overrides={})=>({
  id:"part-1",kind:"field",page:1,origin:"customer",
  label:"Account type",fieldKey:"accountType",value:"PRIVATE_CUSTOMER_NAME",
  defaultValue:"Saving",x:12,y:105,width:60,height:8,z:1,
  rotation:0,size:12,letterSpacing:0,opacity:1,borderWidth:1,
  align:"left",bold:true,italic:false,underline:false,font:"Arial",
  color:"#101010",background:"transparent",borderColor:"#333333",
  quick:true,dotMatrix:true,preprinted:false,...overrides,
});
const draft=(elements=[item()])=>({
  version:1,mode:"passbook",bankName:"Central Bank of India",
  widthMm:190,heightMm:173,foldMm:86,printStartMm:100,pageCount:1,elements
});
test("reusable layout preserves approved generic Saving default but never customer values",()=>{
  const sanitized=sanitizeLayoutTemplate(draft(),"Central Bank of India");
  assert.equal(sanitized.elements[0].defaultValue,"Saving");
  assert.equal(sanitized.elements[0].value,"");
  assert.equal(sanitized.bankKey,normalizedBankKey("Central Bank of India"));
});
test("custom account/IFSC and customer values are stripped when shared",()=>{
  const elements=[
    item({id:"one",fieldKey:"accountNo",defaultValue:"1234567890012"}),
    item({id:"two",origin:"bank",fieldKey:"GSTIN",defaultValue:"22ABCDE1234A1Z5"}),
  ];
  const result=sanitizeLayoutTemplate(draft(elements),"Central Bank of India");
  assert.ok(result.elements.every(x=>!x.value&&!x.defaultValue));
});
test("template cannot publish embedded image pixels or wrong-bank data",()=>{
  assert.throws(()=>sanitizeLayoutTemplate(draft([item({kind:"image",imageData:"data:image/png;base64,AAAA"})]),"Central Bank of India"));
  assert.throws(()=>sanitizeLayoutTemplate(draft(),"Union Bank of India"));
});

test("dynamic bank logo is a reusable field reference, never embedded pixels",()=>{
 const logo=item({id:"bank-logo",kind:"image",origin:"bank",fieldKey:"bankLogo",label:"Bank Logo",dotMatrix:false});
 const sanitized=sanitizeLayoutTemplate(draft([logo]),"Central Bank of India");
 assert.equal(sanitized.elements[0].fieldKey,"bankLogo");
 assert.equal(sanitized.elements[0].imageData,undefined);
 assert.equal(sanitized.elements[0].dotMatrix,false);
});

test("worker refuses unresolved unreadable OCR even when client bypasses UI",()=>{
  assert.throws(()=>sanitizeLayoutTemplate(draft([
    item({id:"ocr-pending",kind:"text",origin:"static",fieldKey:"",label:"Branch address",needsReview:true})
  ]),"Central Bank of India"),/Unverified or unreadable/);
  const clean=sanitizeLayoutTemplate(draft([
    item({id:"ocr-reviewed",kind:"text",origin:"static",fieldKey:"",label:"Branch address",needsReview:false})
  ]),"Central Bank of India");
  assert.equal(clean.elements[0].needsReview,undefined);
});

test("server-side catalog enforces Union Bank values-only and excludes PR2 graphic shapes",()=>{
 const raw=draft([
  item({id:"value",kind:"field",origin:"customer",fieldKey:"accountNo",dotMatrix:true})
 ]);
 const union={...raw,bankName:"Union Bank of India"};
 assert.ok(sanitizeLayoutTemplate(union,"Union Bank of India"));
 assert.throws(()=>sanitizeLayoutTemplate({...union,elements:[
  item({id:"label",kind:"text",origin:"static",label:"Account No",fieldKey:"",dotMatrix:true})
 ]},"Union Bank of India"),/values only/);
 assert.throws(()=>sanitizeLayoutTemplate(draft([
  item({id:"bad-line",kind:"line",origin:"static",fieldKey:"",dotMatrix:true})
 ]),"Central Bank of India"),/cannot include shapes/);
});

test("step 3: server blocks unreviewed source image/gradient reconstruction",()=>{
 assert.throws(()=>sanitizeLayoutTemplate({...draft(),sourceArtworkStatus:"needsReview"},"Central Bank of India"),/Unreviewed PDF raster/);
 const reviewed=sanitizeLayoutTemplate({...draft(),sourceArtworkStatus:"reviewed"},"Central Bank of India");
 assert.equal(reviewed.sourceArtworkStatus,undefined);
});

test("step 6: public catalog rejects credential and private Bank Information keys",()=>{
 for(const fieldKey of ["apiKey","password","sessionToken","tenantSecret","oauthRefreshToken","firebaseAdmin"]){
   assert.throws(()=>sanitizeLayoutTemplate(draft([
     item({id:"private",origin:"bank",fieldKey,label:"Branch information"})
   ]),"Central Bank of India"),/bank field must not expose/);
 }
 for(const fieldKey of ["GSTIN","ifsc","branchAddress","branchPhone","micr"]){
   assert.ok(sanitizeLayoutTemplate(draft([item({
     id:"safe",origin:"bank",fieldKey,label:"Bank information"
   })]),"Central Bank of India"));
 }
});

test("step 6: Hindi and mixed-language bank names never share an empty or truncated catalog key",()=>{
 const hindiA="असम ग्रामीण विकास बैंक",hindiB="पंजाब नेशनल बैंक";
 const a=normalizedBankKey(hindiA),b=normalizedBankKey(hindiB);
 assert.ok(a.startsWith("bank-u"));
 assert.ok(b.startsWith("bank-u"));
 assert.notEqual(a,b);
 assert.notEqual(normalizedBankKey("National ग्रामीण Bank"),normalizedBankKey("National पंजाब Bank"));
 assert.equal(normalizedBankKey("Union Bank of India"),"union-bank-of-india",
   "legacy bank keys must not be changed");
});

test("step 7: Word-style multi-line generic text is shared without silent truncation",()=>{
 const paragraph="Please check customer details.\n"+"Use the actual issue date. ".repeat(8);
 assert.ok(paragraph.length>130);
 const bank="Central Bank of India";
 const result=sanitizeLayoutTemplate(draft([
   item({id:"instructions",kind:"text",origin:"static",fieldKey:"",label:paragraph,dotMatrix:false})
 ]),bank);
 assert.equal(result.elements[0].label,paragraph.trim());
 assert.throws(()=>sanitizeLayoutTemplate(draft([
   item({id:"huge",kind:"text",origin:"static",fieldKey:"",label:"A".repeat(501),dotMatrix:false})
 ]),bank),/500 characters/);
});

test("steps 5–7: server refuses a publishable bank layer crossing the calibrated paper edge",()=>{
  for(const coordinates of [
    {x:180,width:25},{y:167,height:12},{x:190,width:1},{y:-1}
  ]){
    assert.throws(()=>sanitizeLayoutTemplate(draft([item(coordinates)]),"Central Bank of India"),
      /Invalid layout element/,"an out-of-bounds element must be corrected before approval");
  }
  assert.equal(sanitizeLayoutTemplate(draft([item({x:180,width:10,y:160,height:13})]),
    "Central Bank of India").elements.length,1);
});
