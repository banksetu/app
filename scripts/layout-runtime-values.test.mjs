import test from "node:test";
import assert from "node:assert/strict";
import {boundLayoutValue,visibleLayoutElement,templateCanRender} from "../src/layoutRuntimeValues.ts";
const layer=(overrides={})=>({
 id:"a",kind:"field",origin:"customer",label:"Account Holder",fieldKey:"customerName",
 x:15,y:98,width:70,height:6,z:1,rotation:0,size:11,font:"Arial",align:"left",
 bold:false,italic:false,underline:false,color:"#000000",background:"transparent",
 borderColor:"#000000",borderWidth:1,letterSpacing:0,opacity:1,quick:true,dotMatrix:true,preprinted:false,
 ...overrides,
});
test("dynamic fields bind only current customer values and never another workspace",()=>{
 const customer={name:"Sample User",enrolId:"C100",accountNo:"123412341234",fullAddress:"Road"};
 const bank={branchName:"Main Branch",GSTIN:"22AAAAA0000A1Z5"};
 assert.equal(boundLayoutValue(layer(),customer,bank),"Sample User");
 assert.equal(boundLayoutValue(layer({fieldKey:"customerId"}),customer,bank),"C100");
 assert.equal(boundLayoutValue(layer({origin:"bank",fieldKey:"GSTIN"}),customer,bank),"22AAAAA0000A1Z5");
 assert.equal(boundLayoutValue(layer({fieldKey:"unknownInternalSecret",defaultValue:""}),{...customer,unknownInternalSecret:"private"},bank),"");
});
test("preprinted labels and all graphics are excluded from dot-matrix data output",()=>{
 assert.equal(visibleLayoutElement(layer({origin:"preprinted",preprinted:true}),"dotmatrix"),false);
 assert.equal(visibleLayoutElement(layer({kind:"photo",origin:"static",dotMatrix:true}),"dotmatrix"),false);
 assert.equal(visibleLayoutElement(layer({kind:"image",origin:"static",dotMatrix:true}),"dotmatrix"),false);
 for(const kind of ["line","rectangle","ellipse","photo","image"]) {
  assert.equal(visibleLayoutElement(layer({kind,origin:"static",dotMatrix:true}),"dotmatrix"),false,kind);
 }
 assert.equal(visibleLayoutElement(layer({origin:"customer"}),"dotmatrix"),true);
 assert.equal(visibleLayoutElement(layer({origin:"preprinted"}),"quick"),true);
});
test("live layout requires same bank, correct mode and single printed passbook page",()=>{
 const template={id:"catalog",mode:"passbook",bankName:"State Bank of India",widthMm:190,heightMm:175,pageCount:1,elements:[layer()]};
 assert.equal(templateCanRender(template,"State Bank of India","passbook"),true);
 assert.equal(templateCanRender(template,"Union Bank","passbook"),false);
 assert.equal(templateCanRender({...template,pageCount:2},"State Bank of India","passbook"),false);
 assert.equal(templateCanRender(template,"State Bank of India","accountOpening"),false);
});

test("activated passbook rejects invalid physical calibration and page counts",()=>{
 const source={id:"clean",mode:"passbook",bankName:"Test Bank",widthMm:190,heightMm:175,
  foldMm:88,printStartMm:100,pageCount:1,elements:[layer()]};
 assert.equal(templateCanRender(source,"Test Bank","passbook"),true);
 for(const diff of [{foldMm:NaN},{printStartMm:-1},{printStartMm:176},{pageCount:1.5},{pageCount:0}]){
  assert.equal(templateCanRender({...source,...diff},"Test Bank","passbook"),false,JSON.stringify(diff));
 }
});
