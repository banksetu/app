import test from "node:test";
import assert from "node:assert/strict";
import {smartSnap} from "../src/layoutSmartGuides.ts";
const a=(id,x,y,width=20,height=10,page=1)=>({id,x,y,width,height,page});
test("smart guide snaps matching left, center and right edges",()=>{
 const other=[a("reference",50,60,20,10)];
 const left=smartSnap([a("moving",10,10)],other,39.3,49.5,1);
 assert.equal(left.dx,40);assert.equal(left.dy,50);
 assert.deepEqual(left.guides.map(g=>g.axis),["x","y"]);
 const center=smartSnap([a("moving",20,20,10)],other,34.5,44.5,1);
 assert.equal(center.dx,35);assert.equal(center.dy,45);
});
test("smart guides ignore same selected group, other pages and distant targets",()=>{
 assert.deepEqual(smartSnap([a("a",10,10),a("b",30,30)],[a("b",30,30),a("page2",50,50,10,10,2)],10,10,1),{dx:10,dy:10,guides:[]});
 assert.deepEqual(smartSnap([a("a",10,10)],[a("far",150,150)],0,0,1),{dx:0,dy:0,guides:[]});
});
test("invalid movement/tolerance never shifts coordinates",()=>{
 assert.deepEqual(smartSnap([a("a",10,10)],[a("b",12,12)],3,4,-1),{dx:3,dy:4,guides:[]});
});
