import test from "node:test";
import assert from "node:assert/strict";
import {wordCase,changeStaticTextCase,copyRibbonObjects,pasteRibbonObjects} from "../src/layoutRibbonEditing.ts";
const part=(id,extra={})=>({id,kind:"text",origin:"static",label:"hello world",x:20,y:20,width:35,height:10,z:1,page:1,locked:false,groupId:undefined,value:"",...extra});

test("case tools transform static draft labels, never customer/bank fields or locked objects",()=>{
  assert.equal(wordCase("HELLO world","sentence"),"Hello world");
  assert.equal(wordCase("hello WORLD","title"),"Hello World");
  assert.equal(wordCase("One two","upper"),"ONE TWO");
  const input=[part("s"),part("field",{kind:"field",origin:"customer",label:"Private customer"}),part("locked",{locked:true})];
  const result=changeStaticTextCase(input,input.map(x=>x.id),"upper");
  assert.equal(result.changed,1);assert.equal(result.parts[0].label,"HELLO WORLD");
  assert.equal(result.parts[1].label,"Private customer");
  assert.equal(result.parts[2].label,"hello world");
  assert.equal(input[0].label,"hello world","input immutable");
});
test("copy and paste uses only in-app private draft metadata; never retains customer preview values",()=>{
  const source=[part("first"),part("field",{kind:"field",origin:"customer",label:"Account holder",value:"Sensitive Preview"})];
  const clip=copyRibbonObjects(source,["first","field"]);
  assert.equal(clip[1].value,"");assert.equal(source[1].value,"Sensitive Preview");
  let seq=0;const pasted=pasteRibbonObjects(source,clip,{widthMm:190,heightMm:175,page:2},()=>"new-"+(++seq));
  assert.equal(pasted.inserted.length,2);
  assert.equal(pasted.inserted[1].value,"");
  assert.equal(pasted.inserted[1].page,2);
  assert.equal(pasted.inserted[0].groupId,undefined);
  assert.notEqual(pasted.inserted[0].id,source[0].id);
  assert.equal(source.length,2,"source immutable");
});
test("paste clamps objects to measured paper and blocks unsafe sizes or object limits",()=>{
  const input=[part("a",{x:178,y:165,width:12,height:10})];
  let seq=0;
  const r=pasteRibbonObjects(input,copyRibbonObjects(input,["a"]),{widthMm:190,heightMm:175,page:1},()=>"n"+(++seq));
  assert.equal(r.inserted[0].x,178);assert.equal(r.inserted[0].y,165);
  assert.throws(()=>pasteRibbonObjects(input,[part("bad",{width:200})],{widthMm:190,heightMm:175,page:1},()=>randomId()),/too large/);
  const full=Array.from({length:300},(_,i)=>part("p"+i));
  assert.throws(()=>pasteRibbonObjects(full,copyRibbonObjects(input,["a"]),{widthMm:190,heightMm:175,page:1},()=>randomId()),/300-object/);
});
