// Conservative, read-only audit: report potential unreferenced layout modules.
// No file is deleted: runtime lazy imports, worker routes and build hooks may be dynamic.
import {readFileSync,readdirSync,statSync} from "node:fs";
import {join,relative,resolve,extname} from "node:path";
const root=resolve(new URL("..",import.meta.url).pathname);
const roots=["src","cloudflare","scripts","desktop","android"];
const extensions=new Set([".js",".mjs",".cjs",".ts",".tsx",".json",".html",".css",".yml",".yaml"]);
const files=[];
function walk(dir){
 try{for(const entry of readdirSync(dir,{withFileTypes:true})){
   if(entry.name==="node_modules"||entry.name==="dist"||entry.name==="build"||entry.name.startsWith("."))continue;
   const path=join(dir,entry.name);
   if(entry.isDirectory())walk(path);
   else if(entry.isFile()&&extensions.has(extname(entry.name))&&statSync(path).size<3_000_000)files.push(path);
 }}catch{/* absent platform-specific folder */}
}
for(const dir of roots)walk(join(root,dir));
const text=files.map(path=>({path,rel:relative(root,path).replaceAll("\\","/"),data:readFileSync(path,"utf8")}));
const candidates=text.filter(x=>/^(src\/layout[A-Z].*\.(ts|tsx)|src\/LayoutSetupWizard\.tsx|src\/CustomizeLayoutStudio\.(ts|tsx|css))$/.test(x.rel));
const flagged=[];
for(const file of candidates){
 const basename=file.rel.split("/").at(-1).replace(/\.(tsx?|css)$/,"");
 const referenced=text.some(other=>other.rel!==file.rel&&
  (other.data.includes("./"+basename)||other.data.includes("/"+basename)||other.data.includes(basename+".ts")));
 if(!referenced)flagged.push(file.rel);
}
console.log("Layout module dependency audit: scanned",text.length,"text files;",candidates.length,"layout candidates.");
console.log("Potentially unreferenced (manual review only):",flagged.length?flagged.join(", "):"none");
console.log("No deletion performed. Runtime imports, platform hooks, external references and tests must be reviewed before removal.");
