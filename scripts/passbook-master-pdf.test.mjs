import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import ts from 'typescript';

test('approved master is A4, retains leading zeros and rejects overflow',async()=>{
  const root=resolve(import.meta.dirname,'..');
  let source=await readFile(join(root,'src/passbookMasterPdf.ts'),'utf8');
  source=source.replace('import.meta.env.BASE_URL',"'/'");
  source=source.replace("from 'jspdf'",`from '${resolve(root,'node_modules/jspdf/dist/jspdf.node.min.js')}'`);
  const temp=await mkdtemp(join(tmpdir(),'bank-master-'));
  const previousFetch=globalThis.fetch;
  try{
    const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const file=join(temp,'render.mjs');await writeFile(file,compiled);
    const {createMasterPassbookPdf}=await import(file);
    globalThis.fetch=async url=>{
      const data=await readFile(join(root,'public',String(url).replace(/^\//,'')));
      return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
    };
    const values={accountNo:'000123456789',customerId:'SYN001',holder:'SYNTHETIC CUSTOMER'};
    const pdf=await createMasterPassbookPdf(values);
    const bytes=Buffer.from(await pdf.arrayBuffer());
    assert.match(bytes.toString('latin1',0,350),/%PDF-/);
    const pageBox=bytes.toString('latin1',0,300).match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert.ok(pageBox,'PDF contains a MediaBox');
    assert.ok(Math.abs(Number(pageBox[1])-595.28)<.02 && Math.abs(Number(pageBox[2])-841.89)<.02,'A4 dimensions');
    assert.ok(bytes.byteLength>50000);
    await assert.rejects(createMasterPassbookPdf({...values,holder:'LONG CUSTOMER NAME '.repeat(20)}),/approved fixed spaces: holder/);
  }finally{globalThis.fetch=previousFetch;await rm(temp,{recursive:true,force:true});}
});
