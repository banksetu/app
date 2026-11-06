import test from "node:test";
import assert from "node:assert/strict";
import { normalizedBankKey, sanitizeLayoutTemplate } from "./layoutTemplates.js";
const template = () => ({
  version:1, bankName:"State Bank of India (SBI)", mode:"passbook",
  widthMm:190,heightMm:175,foldMm:87,printStartMm:100,pageCount:2,
  elements:[
    {id:"bankheading",kind:"text",page:1,origin:"static",label:"STATE BANK OF INDIA",
      fieldKey:"",value:"",defaultValue:"",x:5,y:10,width:120,height:8,z:1,rotation:0,
      font:"Arial",size:14,bold:true,italic:false,underline:false,align:"center",
      color:"#113355",background:"transparent",borderColor:"#aabbcc",borderWidth:1,letterSpacing:0,opacity:1,
      quick:true,dotMatrix:false,preprinted:true},
    {id:"name",kind:"field",page:2,origin:"customer",label:"Customer Name",fieldKey:"name",
      value:"Secret personal name",defaultValue:"Secret default",x:12,y:105,width:100,height:9,z:2,rotation:0,
      font:"Arial",size:11,bold:false,italic:false,underline:false,align:"left",
      color:"#000000",background:"transparent",borderColor:"#aabbcc",borderWidth:1,letterSpacing:0,opacity:1,
      quick:true,dotMatrix:true,preprinted:false}
  ]
});
test("shared layouts have normalized bank keys and preserve only generic geometry",()=>{
  assert.equal(normalizedBankKey(" State Bank of India (SBI) "), "state-bank-of-india-sbi");
  const result=sanitizeLayoutTemplate(template(),"State Bank of India (SBI)");
  assert.equal(result.bankKey,"state-bank-of-india-sbi");
  assert.equal(result.pageCount,2);
  assert.equal(result.elements[1].page,2);
  assert.equal(result.elements[1].value,"");
  assert.equal(result.elements[1].defaultValue,"");
  assert.equal(result.elements[0].label,"STATE BANK OF INDIA");
  assert.equal(JSON.stringify(result).includes("Secret"),false);
});
test("catalog rejects wrong banks, malformed objects, hidden pixel uploads and possible account data",()=>{
  const source=template();
  assert.throws(()=>sanitizeLayoutTemplate(source,"Punjab National Bank"),/bank must match/);
  assert.throws(()=>sanitizeLayoutTemplate({...source,pageCount:0},source.bankName),/pages/);
  const privateText=template();privateText.elements[0].label="My 1234567890123456 account";
  assert.throws(()=>sanitizeLayoutTemplate(privateText,source.bankName),/customer data/);
  const pixels=template();pixels.elements[0].kind="image";pixels.elements[0].imageData="data:image/png;base64,AAAA";
  assert.throws(()=>sanitizeLayoutTemplate(pixels,source.bankName),/Invalid layout element/);
  const invalid=template();invalid.elements[0].x=900;
  assert.throws(()=>sanitizeLayoutTemplate(invalid,source.bankName),/Invalid layout element/);
});
test("shared templates cannot include duplicated layer IDs or out-of-bounds PDF pages",()=>{
  const copy=template();copy.elements[1].id=copy.elements[0].id;
  assert.throws(()=>sanitizeLayoutTemplate(copy,copy.bankName),/Duplicate/);
  const invalid=template();invalid.elements[1].page=11;
  assert.throws(()=>sanitizeLayoutTemplate(invalid,invalid.bankName),/page/);
});

test("Master-approved template preserves safe page margins, measured fold orientation and print baseline",()=>{
  const source=template();
  source.pageSetup={foldAxis:"horizontal",marginTopMm:9,marginBottomMm:8,marginLeftMm:8,marginRightMm:8};
  const result=sanitizeLayoutTemplate(source,source.bankName);
  assert.deepEqual(result.pageSetup,source.pageSetup);
  assert.equal(result.foldMm,87);
  assert.equal(result.printStartMm,100);
  const wrong={...source,pageSetup:{...source.pageSetup,apiKey:"secret"}};
  assert.throws(()=>sanitizeLayoutTemplate(wrong,wrong.bankName),/page setup|metadata/i);
  const invalid={...source,pageSetup:{...source.pageSetup,marginLeftMm:110,marginRightMm:110}};
  assert.throws(()=>sanitizeLayoutTemplate(invalid,invalid.bankName),/margins|measurements/i);
});
