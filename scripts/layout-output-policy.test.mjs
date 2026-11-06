import test from "node:test";
import assert from "node:assert/strict";
import {isLayoutLayerPrintable} from "../src/layoutOutputPolicy.ts";
import {visibleLayoutElement} from "../src/layoutRuntimeValues.ts";
const item=(change={})=>({kind:"field",origin:"customer",quick:true,dotMatrix:true,preprinted:false,...change});
test("step 5: Quick keeps artwork, PR2 never includes shapes, images, photos, lines or preprinted text",()=>{
 for(const kind of ["rectangle","ellipse","line","image","photo"]){
   assert.equal(isLayoutLayerPrintable(item({kind}),"quick","Central Bank of India"),true,kind);
   assert.equal(isLayoutLayerPrintable(item({kind}),"dotmatrix","Central Bank of India"),false,kind);
 }
 assert.equal(isLayoutLayerPrintable(item({origin:"preprinted",preprinted:false}),"dotmatrix"),false);
 assert.equal(isLayoutLayerPrintable(item({preprinted:true}),"dotmatrix"),false);
 assert.equal(isLayoutLayerPrintable(item({kind:"text",origin:"static"}),"dotmatrix","Central Bank of India"),true);
});
test("step 5: Union Bank stock keeps ALL labels preprinted and prints only dynamic customer/bank fields",()=>{
 const bank="Union Bank of India";
 for(const origin of ["static","preprinted"]){
   assert.equal(isLayoutLayerPrintable(item({kind:"text",origin,preprinted:false}),"dotmatrix",bank),false);
 }
 assert.equal(isLayoutLayerPrintable(item({origin:"customer"}),"dotmatrix",bank),true);
 assert.equal(isLayoutLayerPrintable(item({origin:"bank"}),"dotmatrix",bank),true);
 assert.equal(isLayoutLayerPrintable(item({kind:"text",origin:"dotmatrix"}),"dotmatrix",bank),false);
 assert.equal(isLayoutLayerPrintable(item({kind:"text",origin:"dotmatrix",fieldKey:"accountNo"}),"dotmatrix",bank),true);
 assert.equal(isLayoutLayerPrintable(item({kind:"text",origin:"dotmatrix",fieldKey:""}),"dotmatrix",bank),false);
 assert.equal(visibleLayoutElement(item({kind:"text",origin:"static"}),"dotmatrix",bank),false);
});
