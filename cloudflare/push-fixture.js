import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";

export function setupPushFixture() {
  const project="synthetic-push-queue",base="projects/"+project+"/databases/(default)/documents",store=new Map(),calls=[],sent=[];
  const encode=value=>value===null?{nullValue:null}:typeof value==="string"?{stringValue:value}:typeof value==="boolean"?{booleanValue:value}:typeof value==="number"?{integerValue:String(value)}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,value])=>[key,encode(value)]))}};
  const decode=value=>"stringValue"in value?value.stringValue:"integerValue"in value?Number(value.integerValue):"booleanValue"in value?value.booleanValue:"nullValue"in value?null:"arrayValue"in value?(value.arrayValue.values||[]).map(decode):Object.fromEntries(Object.entries(value.mapValue?.fields||{}).map(([key,value])=>[key,decode(value)]));
  const values=doc=>Object.fromEntries(Object.entries(doc?.fields||{}).map(([key,value])=>[key,decode(value)]));
  let revision=0,transient=0;
  const put=(path,value)=>{const doc={name:base+"/"+path,fields:Object.fromEntries(Object.entries(value).map(([key,value])=>[key,encode(value)])),updateTime:new Date(Date.UTC(2026,9,13)+ ++revision).toISOString()};store.set(path,doc);return doc;};
  const original=globalThis.fetch,{privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const env={FIREBASE_PROJECT_ID:project,FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:"push@example.invalid",private_key:privateKey.export({type:"pkcs8",format:"pem"})})};
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);calls.push(target);
    if(target.includes("oauth2.googleapis.com/token"))return Response.json({access_token:"synthetic",expires_in:3600});
    if(target==="https://banksetu-app.web.app/version.json")return Response.json({androidVersion:"1.0.73"});
    if(target.includes("fcm.googleapis.com")){
      if(transient){transient--;return Response.json({error:{message:"Synthetic retry"}},{status:503});}
      sent.push(JSON.parse(options.body).message);return Response.json({name:"synthetic-delivery"});
    }
    if(!target.includes("firestore.googleapis.com"))throw Error("Unexpected fixture URL: "+target);
    const path=decodeURIComponent(target.split("/documents")[1]||"");
    if(path===":runQuery"){
      const query=JSON.parse(options.body).structuredQuery,collection=query.from[0].collectionId,filter=query.where?.fieldFilter;
      let docs=[...store.entries()].filter(([key])=>key.startsWith(collection+"/")).map(([,doc])=>doc);
      if(filter){const expected=decode(filter.value);docs=docs.filter(doc=>filter.op==="EQUAL"?values(doc)[filter.field.fieldPath]===expected:Date.parse(values(doc)[filter.field.fieldPath])<=Date.parse(expected));}
      return Response.json(docs.slice(0,query.limit).map(document=>({document})));
    }
    if(path===":commit"){
      const writes=JSON.parse(options.body).writes;
      for(const write of writes){const name=write.update?.name||write.delete;assert(name.startsWith(base+"/"));const old=store.get(name.slice(base.length+1));if(write.currentDocument?.exists===false&&old||write.currentDocument?.updateTime&&old?.updateTime!==write.currentDocument.updateTime)return Response.json({error:{message:"Conflict"}},{status:409});}
      for(const write of writes){const name=write.update?.name||write.delete,key=name.slice(base.length+1);if(write.delete)store.delete(key);else store.set(key,{...write.update,updateTime:new Date(Date.UTC(2026,9,13)+ ++revision).toISOString()});}
      return Response.json({});
    }
    if(path.startsWith("/tenantLicenses?")){
      const page=Number(new URL(target).searchParams.get("pageToken")||0),docs=[...store.entries()].filter(([key])=>key.startsWith("tenantLicenses/")).map(([,doc])=>doc);
      assert.equal(new URL(target).searchParams.get("pageSize"),"1");
      return Response.json({documents:docs.slice(page,page+1),...(page+1<docs.length?{nextPageToken:String(page+1)}:{})});
    }
    const doc=store.get(path.replace(/^\//,"").split("?")[0]);return doc?Response.json(doc):Response.json({error:{message:"Not found"}},{status:404});
  };
  return {env,store,calls,sent,put,values,failNext:()=>transient++,restore:()=>globalThis.fetch=original};
}
