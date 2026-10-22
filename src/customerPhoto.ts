export const CUSTOMER_PHOTO_MAX_BYTES = 15_360;

export type OptimizedCustomerPhoto = {dataUrl:string;bytes:number;qualityWarning:boolean};

const encode = (canvas:HTMLCanvasElement, quality:number) => new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Photo compression is unavailable on this device.")),"image/jpeg",quality);
});

export async function optimizeCustomerPhoto(source:Blob):Promise<OptimizedCustomerPhoto> {
  if(!source.type.startsWith("image/"))throw new Error("Choose a JPG, PNG or WEBP customer photo.");
  let image:ImageBitmap|HTMLImageElement|undefined;
  let objectUrl="";
  try {
    if(typeof createImageBitmap==="function"){
      try {image=await createImageBitmap(source,{imageOrientation:"from-image"});}
      catch { /* Older WebViews decode and orient through the image element below. */ }
    }
    if(!image) {
      objectUrl=URL.createObjectURL(source);
      const element=new Image();element.src=objectUrl;
      await element.decode();image=element;
    }
    const width=image instanceof HTMLImageElement?image.naturalWidth:image.width;
    const height=image instanceof HTMLImageElement?image.naturalHeight:image.height;
    if(!width||!height)throw new Error("This photo could not be read. Choose another image.");
    const canvas=document.createElement("canvas");
    const context=canvas.getContext("2d",{alpha:false});
    if(!context)throw new Error("Photo compression is unavailable on this device.");
    let selected:Blob|undefined,selectedWidth=0,selectedQuality=0;
    for(const bound of [512,448,384,320,272,224]) {
      const scale=Math.min(1,bound/Math.max(width,height));
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [0.82,0.70,0.58,0.48]) {
        const blob=await encode(canvas,quality);
        if(blob.size<=CUSTOMER_PHOTO_MAX_BYTES){selected=blob;selectedWidth=Math.min(canvas.width,canvas.height);selectedQuality=quality;break;}
      }
      if(selected&&selectedQuality>=0.58)break;
    }
    if(!selected)throw new Error("This photo cannot fit under 15 KB clearly. Retake it or choose another photo.");
    const dataUrl=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Optimized photo could not be read."));reader.readAsDataURL(selected);
    });
    if(selected.size>CUSTOMER_PHOTO_MAX_BYTES)throw new Error("Optimized photo exceeds 15 KB.");
    return {dataUrl,bytes:selected.size,qualityWarning:selectedQuality<0.58||selectedWidth<240};
  } finally {
    if(image&&"close" in image)image.close();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
  }
}
