/** A single output rule shared by the live activated renderer and draft proof.
 * This does not replace the existing PR2 bridge or bank-specific print layouts.
 */
export type LayoutOutputLayer={
  kind:string;origin:string;quick:boolean;dotMatrix:boolean;preprinted:boolean;
};
export type LayoutOutputMode="quick"|"dotmatrix";
export function isLayoutLayerPrintable(
 layer:LayoutOutputLayer,mode:LayoutOutputMode,bankName="",
):boolean{
 if(mode==="quick")return layer.quick===true;
 if(layer.dotMatrix!==true||layer.preprinted===true||layer.origin==="preprinted")return false;
 if(layer.kind!=="text"&&layer.kind!=="field")return false;
 // Union Bank's physical stock includes all labels: print values only.
 if(/union\s+bank/i.test(bankName)&&
     (layer.origin==="static"||layer.origin==="preprinted"||layer.origin==="dotmatrix"&&layer.kind==="text"))
   return false;
 return true;
}
