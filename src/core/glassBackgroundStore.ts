/** Appearance wallpaper storage is separate from customer records, sync and backups. */
const DATABASE="bankSetuAppearanceAssets",STORE="wallpapers";
function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){reject(new Error("Device image storage is unavailable."));return;}
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Could not open local image storage."));
  });
}
async function transaction<T>(key:string,mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDatabase();
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    const request=action(tx.objectStore(STORE));
    let value:T;
    request.onsuccess=()=>{value=request.result;};
    request.onerror=()=>reject(request.error||new Error("Wallpaper storage failed."));
    tx.oncomplete=()=>resolve(value);
    tx.onabort=()=>reject(tx.error||new Error("Wallpaper storage was interrupted."));
  });}finally{db.close();}
}
export function readGlassWallpaper(key:string){return transaction<Blob|undefined>(key,"readonly",store=>store.get(key));}
export function saveGlassWallpaper(key:string,blob:Blob){return transaction<IDBValidKey>(key,"readwrite",store=>store.put(blob,key));}
export function deleteGlassWallpaper(key:string){return transaction<undefined>(key,"readwrite",store=>store.delete(key));}
/** Uploads are rasterized, resized and encoded to JPEG; no SVG, script, or remote URL is allowed. */
export async function prepareGlassWallpaper(file:File):Promise<{blob:Blob;luminance:number}>{
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose a JPG, PNG or WebP image.");
  if(file.size>10*1024*1024)throw new Error("Choose an image smaller than 10 MB.");
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("This device cannot process the background image.");
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const samples=context.getImageData(0,0,Math.min(canvas.width,64),Math.min(canvas.height,64)).data;
    let sum=0;
    for(let n=0;n<samples.length;n+=4)sum+=(.2126*samples[n]+.7152*samples[n+1]+.0722*samples[n+2])/255;
    const luminance=samples.length?sum/(samples.length/4):.5;
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Background compression failed.")),"image/jpeg",.8));
    return {blob,luminance};
  }finally{bitmap.close();}
}
