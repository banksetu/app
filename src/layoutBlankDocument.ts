/** Non-destructive blank-start state for the office-style passbook editor.
 * Works for every bank and any valid physical paper size; never auto-imports
 * a customer value, logo, uploaded PDF or original bank-specific template.
 */
export type BlankLayout<T> = {
  widthMm:number;heightMm:number;pageCount?:number;foldMm:number;printStartMm:number;
  elements:T[];sourceArtworkStatus?:"clean"|"needsReview"|"reviewed";
};
export function startBlankLayout<T extends BlankLayout<unknown>>(previous:T):T{
  const widthMm=previous.widthMm,heightMm=previous.heightMm;
  if(![widthMm,heightMm].every(n=>Number.isFinite(n)&&n>=50&&n<=500))
    throw Error("Select a valid physical passbook size before creating a blank canvas.");
  return {...previous,pageCount:1,elements:[],sourceArtworkStatus:"clean",
    foldMm:0,printStartMm:0} as T;
}
/** Paper alignment only moves an element within the existing measured page. */
export function alignElementToPage<T extends {x:number;y:number;width:number;height:number}>(
  object:T,paper:{widthMm:number;heightMm:number},
  axis:"horizontal"|"vertical",side:"start"|"center"|"end",
):T{
  const bound=axis==="horizontal"?paper.widthMm:paper.heightMm;
  const size=axis==="horizontal"?object.width:object.height;
  if(![bound,size].every(Number.isFinite)||bound<=0||size<=0||size>bound)
    throw Error("Element is larger than the selected physical page.");
  const n=side==="start"?0:side==="end"?bound-size:(bound-size)/2;
  return {...object,[axis==="horizontal"?"x":"y"]:Math.round(n*10)/10};
}
