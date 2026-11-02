/**
 * Copy pin-locked Tesseract runtime + ENG/HIN models into the built application.
 * No runtime CDN access, no scanner upload and no internet access at build time.
 * Models stay lazy-loaded at OCR use, never part of the login bundle.
 */
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

export function prepareOfflineOcr(outDir="dist",root=process.cwd()){
  const npm=(...names)=>path.join(root,"node_modules",...names);
  const output=path.join(root,outDir,"ocr");
  const worker=npm("tesseract.js","dist","worker.min.js");
  const core=npm("tesseract.js-core");
  for(const required of [worker,core]){
    if(!fs.existsSync(required))throw Error("Pinned Tesseract package missing: "+required);
  }
  fs.mkdirSync(path.join(output,"core"),{recursive:true});
  fs.mkdirSync(path.join(output,"lang"),{recursive:true});
  fs.copyFileSync(worker,path.join(output,"worker.min.js"));
  let count=0;
  for(const name of fs.readdirSync(core)){
    if(/^tesseract-core.*\.(?:js|wasm)$/.test(name)){
      fs.copyFileSync(path.join(core,name),path.join(output,"core",name));count++;
    }
  }
  if(count<2)throw Error("Tesseract WASM core scripts missing; do not ship an incomplete OCR bundle.");
  for(const lang of ["eng","hin"]){
    const rootDir=npm("@tesseract.js-data",lang);
    if(!fs.existsSync(rootDir))throw Error("Pinned OCR model package missing: "+lang);
    const matches=[];
    const find=(dir,depth=0)=>{
      if(depth>4)return;
      for(const item of fs.readdirSync(dir,{withFileTypes:true})){
        const full=path.join(dir,item.name);
        if(item.isDirectory())find(full,depth+1);
        else if(item.name===lang+".traineddata.gz")matches.push(full);
      }
    };
    find(rootDir);
    // Official data packages include both standard (~11 MB) and best_int
    // (~3 MB) models. Choose the pin-locked compact LSTM model for Android
    // and Firebase bandwidth; never import duplicate language versions.
    const selected=matches.find(file=>file.split(path.sep).includes("4.0.0_best_int"))||
      matches.find(file=>file.split(path.sep).includes("4.0.0"));
    if(!selected)throw Error("Pinned "+lang+" OCR package contains no supported traineddata.gz model.");
    fs.copyFileSync(selected,path.join(output,"lang",lang+".traineddata.gz"));
  }
  const manifest={version:1,eng:true,hin:true,coreFiles:count,localOnly:true};
  fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest));
  return manifest;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const output=process.argv[2]||"dist";
  const result=prepareOfflineOcr(output);
  console.log("Offline OCR assets prepared for "+output,JSON.stringify(result));
}
