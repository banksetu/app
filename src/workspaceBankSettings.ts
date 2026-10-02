export type SavedBankInfo = { bankName:string; passbookBank:string; branchName:string; cspCode:string; operatorName:string; address:string };
const fields = ["bankName","passbookBank","branchName","cspCode","operatorName","address"] as const;
export function restoreWorkspaceBankSettings(data:Record<string,unknown>) {
  const nested = data.bankInfo && typeof data.bankInfo === "object" ? data.bankInfo as Record<string,unknown> : {};
  const bankInfo = Object.fromEntries(fields.map(field=>[field,typeof data[field] === "string" ? data[field] : typeof nested[field] === "string" ? nested[field] : ""])) as SavedBankInfo;
  return { bankInfo, bankLogo:typeof data.bankLogo === "string" ? data.bankLogo : "" };
}
export async function prepareBankLogo(file:File) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > 5*1024*1024) throw new Error("Choose a PNG, JPG, WebP or SVG logo up to 5 MB.");
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("The logo image could not be read."));image.src=url;});
    const canvas=document.createElement("canvas"), scale=Math.min(1,512/image.width,512/image.height);
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext("2d");if(!context)throw new Error("This browser could not prepare the logo.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let result=canvas.toDataURL("image/webp",0.85);
    if(result.length>150000) result=canvas.toDataURL("image/webp",0.6);
    if(result.length>150000)throw new Error("Choose a simpler or smaller bank logo.");
    return result;
  }finally{URL.revokeObjectURL(url);}
}
