import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const bankSource=fs.readFileSync('src/workspaceBankSettings.ts','utf8');
const bankOutput=ts.transpileModule(bankSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {restoreWorkspaceBankSettings}=await import('data:text/javascript;base64,'+Buffer.from(bankOutput).toString('base64'));
const source=fs.readFileSync('src/passbookInfoLayout.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const layout=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));

test('tenant branch values stay separate and missing settings never get sample defaults',()=>{
  const a=layout.passbookBranchForTenant({branchName:'Branch A',branchAddress:'Road A',branchPostOffice:'PO A',branchDistrict:'District A',branchPinCode:'123456',ifsc:'ABCD0123456',micr:'123456789'});
  const b=layout.passbookBranchForTenant({branchName:'Branch B',branchAddress:'Road B',branchPostOffice:'PO B',branchDistrict:'District B',branchPinCode:'654321',ifsc:'EFGH0987654',micr:'987654321'});
  assert.equal(a.name,'BRANCH A');assert.equal(b.name,'BRANCH B');assert.notDeepEqual(a,b);
  assert.deepEqual(layout.missingPassbookBranchFields(a),[]);
  assert.deepEqual(layout.missingPassbookBranchFields(layout.passbookBranchForTenant()).length,7);
  const restored=restoreWorkspaceBankSettings({bankInfo:{bankName:'Tenant A',passbookBank:'Assam Gramin Bank',branchName:'A',branchAddress:'Road A',ifsc:'ABCD0123456'}}).bankInfo;
  assert.equal(restored.branchAddress,'Road A');assert.equal(restored.ifsc,'ABCD0123456');
  assert.equal(restored.branchDistrict,'');
});

test('physical columns use separate colon groups and preserve 206 mm paper whitespace',()=>{
  assert.equal(layout.PASSBOOK_PAPER_WIDTH_MM,206);assert.equal(layout.PASSBOOK_CONTENT_END_MM,149);
  assert.equal(layout.LEFT_LABEL_X_MM,7);
  assert.equal(layout.LEFT_COLON_X_MM,26.5);
  assert.equal(layout.LEFT_VALUE_X_MM,29);
  assert.equal(layout.RIGHT_CODE_VALUE_X_MM-layout.RIGHT_CODE_COLON_X_MM,4);
  assert.notEqual(layout.RIGHT_CODE_COLON_X_MM,layout.RIGHT_HOLDER_COLON_X_MM);
  assert.notEqual(layout.RIGHT_ADDRESS_X_MM,layout.RIGHT_HOLDER_VALUE_X_MM);
  assert.equal(layout.RIGHT_BRANCH_CODE_X_MM,138.5);
  assert.deepEqual(layout.leftRows.slice(0,5).map(row=>row[0]),['BRANCH NAME','BR. ADDRESS','','','BR. EMAIL']);
  assert.equal(layout.leftRows.at(-1)[1]-layout.leftRows[0][1],12*layout.PASSBOOK_ROW_MM);
  assert.deepEqual(['enrolId','accountNo','pan','contact','accountOpeningDate','issueDate','operatedBy'].map(x=>layout.targetWidthsMm[x]),[16,22,18,21,17,17,6]);
  assert.equal(new Set(layout.leftRows.map(row=>row[1])).size,layout.leftRows.length);
});

test('branch address includes the tenant post office once without replacing its address',()=>{
  assert.equal(layout.passbookBranchAddress('PO:-BADARPUR','BADARPUR'),'PO:-BADARPUR');
  assert.equal(layout.passbookBranchAddress('MAIN ROAD','OTHER PO'),'MAIN ROAD PO:-OTHER PO');
});

test('long names and four address lines preserve all source characters',()=>{
  const address='C/O AKLAS UDDIN\nRETIRED COLONY PO BADARPUR\nMEDOL BEEL\nASSAM.INDIA PIN-788806';
  assert.deepEqual(layout.addressPrintLines(address),address.split('\n'));
  const long='A VERY LONG CUSTOMER HOLDER NAME WITH MANY WORDS';
  assert(layout.fitTextScale(long,46)<1);
  assert.equal(layout.addressPrintLines('Account 001, Road 2').join(' '),'Account 001, Road 2');
});

test('Passbook Print uses the data-only layout without built-in Badarpur branding',()=>{
  const source=fs.readFileSync('src/Passbook.tsx','utf8');
  assert(source.includes('<PassbookInfoFields customer={p} bank={BRANCH} />'));
  assert(!source.includes('DEFAULT_BRANCH'));
  assert(!source.includes('HEAD OFFICE : GUWAHATI'));
  assert(!source.includes('PUNB0RRBAGB'));
  assert(source.includes('nominee:printText(customer.nominee)'));
  assert(source.includes("issueDate:formatDate(customer.issueDate||'')"));
});
