/** Read-only check that the Windows-only editor is absent in Android/web
 * frontend bundles and present in the native Windows EXE build. This scans
 * emitted JS/CSS only; user/customer data is never involved.
 */
import {readdirSync,readFileSync} from "node:fs";
import {resolve,join,extname} from "node:path";
const target=process.argv[2],directory=resolve(process.argv[3]||"dist");
if(!["windows","android","web"].includes(target))throw Error("Expected windows|android|web");
const assets=join(directory,"assets");
const names=readdirSync(assets).filter(name=>[".js",".css"].includes(extname(name)));
const contains=(marker)=>names.some(name=>readFileSync(join(assets,name),"utf8").includes(marker));
const editor=contains("ls-workflow-nav") || contains("Templates & approval");
if(target==="windows"&&!editor)throw Error("Windows EXE layout editor was accidentally omitted from the production bundle.");
if(target!=="windows"&&editor)throw Error("Windows-only advanced layout editor was bundled into Android/web output.");
if(target!=="windows"&&!contains("Customize Layout is available only in BANK SETU Windows EXE"))
 throw Error("Non-Windows bundle did not include the restricted-feature placeholder.");
process.stdout.write(target+" build: Windows-only layout editor "+(editor?"included":"excluded")+"; native feature policy PASS.\n");
