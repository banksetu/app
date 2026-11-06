/** Explicit, reversible split of a preprinted label and a dynamic overprint.
 * Never copy actual OCR customer data into a reusable field's default/value.
 * The caller must select the source field and then inspect print alignment.
 */
export type SplitSource="customer"|"bank";
type RepairablePart={
 id:string;kind:string;origin:string;label:string;fieldKey:string;value:string;
 defaultValue:string;preprinted:boolean;dotMatrix:boolean;quick:boolean;z:number;
 needsReview?:boolean;
};
export function splitPreprintedAndDynamic<T extends RepairablePart>(
  first:T,secondId:string,description:string,fieldKey:string,source:SplitSource,
):{original:T;overprint:T}{
  const name=description.trim(),key=fieldKey.trim();
  if(!first.id?.trim()||!secondId.trim()||first.id===secondId||
     (first.kind!=="text"&&first.kind!=="field"))
    throw Error("Select a valid scanned text line before splitting layers.");
  if(!name||name.length>110||!/^[\p{L}][\p{L}\p{M}\p{N}_ :().&/-]*$/u.test(name))
    throw Error("Use a short generic field description, not account data.");
  if(/[0-9०-९]{5,}/u.test(name))
    throw Error("The generic field description must not contain an account number.");
  if(!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)||
      !["customer","bank"].includes(source))
    throw Error("Select a valid customer or bank field mapping.");
  const original={...first,origin:"preprinted",preprinted:true,dotMatrix:false,quick:true};
  const overprint={...first,
    id:secondId,kind:"field",origin:source,label:name,fieldKey:key,
    value:"",defaultValue:"",preprinted:false,dotMatrix:true,quick:true,
    needsReview:false,z:first.z+1
  };
  return {original:original as T,overprint:overprint as T};
}
