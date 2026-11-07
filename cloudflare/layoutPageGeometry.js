/** Shared Worker-side validation for optional page-setup metadata.
 * Never interpret paper/crease metadata as permission to bypass PR2 calibration.
 * Legacy approved templates without pageSetup retain their historical geometry.
 */
const finite=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
export function sanitizePageSetup(raw){
  const width=raw?.widthMm,height=raw?.heightMm;
  if(!finite(width,50,500)||!finite(height,50,500))
    throw Error("Passbook open-paper dimensions must be 50–500 mm.");
  const setting=raw?.pageSetup;
  if(setting===undefined){
    if(!finite(raw.foldMm,0,height)||!finite(raw.printStartMm,0,height))
      throw Error("Invalid original fold or print start.");
    return undefined;
  }
  if(!setting||typeof setting!=="object"||Array.isArray(setting))
    throw Error("Invalid page setup.");
  const keys=["foldAxis","marginTopMm","marginBottomMm","marginLeftMm","marginRightMm"];
  if(Object.keys(setting).some(key=>!keys.includes(key)))
    throw Error("Page setup includes unsupported metadata.");
  if(!["horizontal","vertical","none"].includes(setting.foldAxis))
    throw Error("Page setup fold direction is invalid.");
  const margins=["marginTopMm","marginBottomMm","marginLeftMm","marginRightMm"];
  if(margins.some(key=>!finite(setting[key],0,120)))
    throw Error("Passbook margins must be 0–120 mm.");
  if(setting.marginLeftMm+setting.marginRightMm>=width||
     setting.marginTopMm+setting.marginBottomMm>=height)
    throw Error("Passbook margins leave no content region.");
  const axisMax=setting.foldAxis==="vertical"?width:height;
  if(!finite(raw.foldMm,0,axisMax)||!finite(raw.printStartMm,0,axisMax))
    throw Error("Fold or data start is outside the open passbook.");
  if(setting.foldAxis==="none"&&raw.foldMm!==0)
    throw Error("Flat documents cannot contain a folded spine.");
  if(setting.foldAxis!=="none"&&raw.foldMm>0&&raw.printStartMm>0&&raw.printStartMm<raw.foldMm)
    throw Error("Print start cannot precede fold.");
  return Object.fromEntries(keys.map(key=>[key,setting[key]]));
}
