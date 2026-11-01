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
