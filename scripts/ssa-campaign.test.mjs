import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Exercise ONLY the isolated SSA additions, with a fake tenant spreadsheet.
// Tests must never access production Google Sheets, Drive or Firebase.
const sourceUrl=new URL("../apps-script/Code.gs",import.meta.url);
const publicUrl=new URL("../public/client-bridge/Code.gs",import.meta.url);
const source=readFileSync(sourceUrl,"utf8");
test("Settings and first-time setup distribute the complete SSA bridge source",()=>{
  mkdirSync(dirname(fileURLToPath(publicUrl)),{recursive:true});
  copyFileSync(sourceUrl,publicUrl); // same source-of-truth operation as prepare-client-assets.mjs
  const publicSource=readFileSync(publicUrl,"utf8");
  const digest=value=>createHash("sha256").update(value).digest("hex");
  assert.equal(digest(publicSource),digest(source));
  assert.match(source,/BANKSETU_BRIDGE_SOURCE_VERSION = "ssa-v1-20261107"/);
  assert.match(source,/function getSsaCampaignEntries/);
  assert.match(source,/function syncSsaCampaignEntry/);
  const client=readFileSync(new URL("../src/core/clientBridge.ts",import.meta.url),"utf8");
  assert.match(client,/CLIENT_BRIDGE_SOURCE_VERSION="ssa-v1-20261107"/);
  assert.doesNotMatch(client,/v9-20261014/);
});
const start=source.indexOf("/* BANK SETU SSA Campaign:");
assert.ok(start>0,"SSA helper section missing");
const code=source.slice(start);
const customerRecordId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const opCreate="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const opUpdate="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const blank=(n)=>Array.from({length:n},()=>"");
class FakeRange {
  constructor(sheet,startRow,startCol,numRows,numCols){
    Object.assign(this,{sheet,startRow,startCol,numRows,numCols});
  }
  getDisplayValues(){
    return Array.from({length:this.numRows},(_,i)=>Array.from({length:this.numCols},(_,j)=>
      String(this.sheet.rows[this.startRow+i-1]?.[this.startCol+j-1]??"")));
  }
  setValues(rows){
    rows.forEach((row,i)=>{
      const index=this.startRow+i-1;
      while(this.sheet.rows.length<=index)this.sheet.rows.push([]);
      row.forEach((v,j)=>{this.sheet.rows[index][this.startCol+j-1]=v;});
    });
  }
  createTextFinder(value){
    return {matchEntireCell:()=>({findNext:()=>{
      for(let i=0;i<this.numRows;i++){
        const row=this.startRow+i;
        if(String(this.sheet.rows[row-1]?.[this.startCol-1]||"")===value)return {getRow:()=>row};
      }
      return null;
    }})};
  }
}
class FakeSheet{
  constructor(name,rows=[]){this.name=name;this.rows=rows;}
  getRange(row,col,nRows,nCols){return new FakeRange(this,row,col,nRows,nCols);}
  getLastRow(){return this.rows.length;}
  appendRow(values){this.rows.push([...values]);}
  setFrozenRows(){}
}
class FakeBook {
  constructor(customerName){this.tabs=new Map();const customer=blank(27);customer[0]="CUST001";customer[1]="789012345678";customer[2]=customerName;customer[24]=customerRecordId;
    this.tabs.set("Sheet1",new FakeSheet("Sheet1",[blank(27),customer]));
  }
  getSheetByName(name){return this.tabs.get(name)||null;}
  insertSheet(name){if(this.tabs.has(name))throw Error("Tab exists");const tab=new FakeSheet(name);this.tabs.set(name,tab);return tab;}
}
function harness(){
  const books={tenantA:new FakeBook("Example Customer"),tenantB:new FakeBook("Different Tenant")};
  const userA={spreadsheetId:"tenantA",connectionId:"conn-A",email:"user-a@example.org"};
  const userB={spreadsheetId:"tenantB",connectionId:"conn-B",email:"user-b@example.org"};
  const scope={
    SpreadsheetApp:{openById:id=>{if(!books[id])throw Error("Unbound book");return books[id];},flush:()=>{}},
    LockService:{getScriptLock:()=>({releaseLock:()=>{}})},
    acquireSyncLock:()=>true,syncBusyResponse:()=>({success:false,code:"SYNC_BUSY"}),
    getSheet:user=>books[user.spreadsheetId].getSheetByName("Sheet1"),
    cleanValue:value=>String(value??"").trim(),
    jsonResponse:value=>value,
    console,Date,RegExp,String,Number,Math,Array,Object
  };
  vm.createContext(scope);vm.runInContext(code,scope);
  const base={entryId,period:"2026-11",entryDate:"2026-11-07",customerRecordId,customerId:"CUST001",
    accountNo:"789012345678",name:"Ignored client name",apy:true,pmjjby:false,pmsby:true};
  const call=(operation,user=userA,connectionId=user.connectionId)=>
    scope.syncSsaCampaignEntry({connectionId,operation},user);
  return {books,userA,userB,scope,base,call};
}
test("SSA creates an independent tenant sheet, preserving customer Sheet1",()=>{
  const x=harness(),before=JSON.stringify(x.books.tenantA.getSheetByName("Sheet1").rows);
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign"),null);
  const created=x.call({operationId:opCreate,mode:"create",baseRevision:0,entry:x.base});
  assert.equal(created.success,true);assert.equal(created.entry.revision,1);
  assert.equal(created.entry.name,"Example Customer");
  assert.equal(created.entry.apy,true);assert.equal(created.entry.pmsby,true);
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign").getLastRow(),2);
  assert.equal(JSON.stringify(x.books.tenantA.getSheetByName("Sheet1").rows),before);
  assert.equal(x.books.tenantB.getSheetByName("SSA Campaign"),null);
});
test("SSA rejects wrong connection before creating any tab",()=>{
  const x=harness();const result=x.call({operationId:opCreate,mode:"create",baseRevision:0,entry:x.base},x.userA,"conn-other");
  assert.equal(result.success,false);assert.equal(result.code,"CONNECTION_CHANGED");
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign"),null);
});
test("SSA repeat operation is idempotent and update checks revision",()=>{
  const x=harness(),op={operationId:opCreate,mode:"create",baseRevision:0,entry:x.base};
  assert.equal(x.call(op).success,true);
  assert.equal(x.call(op).replayed,true);
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign").getLastRow(),2);
  const update={operationId:opUpdate,mode:"update",baseRevision:1,entry:{...x.base,apy:false,pmjjby:true}};
  const updated=x.call(update);
  assert.equal(updated.success,true);assert.equal(updated.entry.revision,2);
  assert.equal(updated.entry.apy,false);assert.equal(updated.entry.pmjjby,true);
  const stale=x.call({operationId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",mode:"update",baseRevision:1,entry:x.base});
  assert.equal(stale.success,false);assert.equal(stale.code,"CONFLICT");
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign").getLastRow(),2);
});
test("SSA cannot duplicate an account in the same month",()=>{
  const x=harness();
  assert.equal(x.call({operationId:opCreate,mode:"create",baseRevision:0,entry:x.base}).success,true);
  const duplicate=x.call({operationId:"ffffffff-ffff-4fff-8fff-ffffffffffff",mode:"create",baseRevision:0,
    entry:{...x.base,entryId:"11111111-1111-4111-8111-111111111111"}});
  assert.equal(duplicate.success,false);assert.equal(duplicate.code,"DUPLICATE");
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign").getLastRow(),2);
});
test("SSA rejects a customer identity from a different tenant",()=>{
  const x=harness();
  const blocked=x.call({operationId:opCreate,mode:"create",baseRevision:0,entry:{...x.base,customerId:"OTHER"}});
  assert.equal(blocked.success,false);assert.equal(blocked.code,"CUSTOMER_MISMATCH");
  assert.equal(x.books.tenantA.getSheetByName("SSA Campaign"),null);
});
