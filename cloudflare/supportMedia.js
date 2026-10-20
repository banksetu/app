// Spark-compatible private media: bounded chunks in the existing Firestore DB.
// The existing Worker cron deletes bytes; no billed Firestore TTL or public URLs.
export const SUPPORT_MEDIA_TTL=24*60*60*1000;
const CHUNK=144*1024,MAX_IMAGE=1024*1024,MAX_AUDIO=2*1024*1024;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const uid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validateSupportMedia(body){
 const mime=String(body.mimeType||'').toLowerCase().split(';')[0];
 const kind=mime.startsWith('image/')?'photo':mime.startsWith('audio/')?'audio':'';
 const types=['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-wav'];
 if(!types.includes(mime))fail('Choose a JPEG, PNG, WebP photo or supported audio file. Video is not supported.');
 const data=body.data;
 if(typeof data!=='string'||data.length>Math.ceil((kind==='photo'?MAX_IMAGE:MAX_AUDIO)/3)*4||data.length%4||/[^A-Za-z0-9+/=]/.test(data))fail('Invalid or oversized support attachment. Photo limit: 1 MB; audio limit: 2 MB.');
 let raw;try{raw=atob(data);}catch{fail('Invalid support attachment encoding.');}
 const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const word=(start,end)=>raw.slice(start,end),starts=(...n)=>n.every((v,i)=>bytes[i]===v);
 const valid=mime==='image/jpeg'?starts(255,216,255):mime==='image/png'?starts(137,80,78,71,13,10,26,10):mime==='image/webp'?word(0,4)==='RIFF'&&word(8,12)==='WEBP':mime==='audio/webm'?starts(26,69,223,163):mime==='audio/ogg'?word(0,4)==='OggS':mime==='audio/mpeg'?word(0,3)==='ID3'||starts(255)&&(bytes[1]&224)===224:mime==='audio/mp4'?word(4,8)==='ftyp':word(0,4)==='RIFF'&&word(8,12)==='WAVE';
 if(bytes.length<12||!valid)fail('The file content does not match its photo/audio type.');
 if(!/^[a-f0-9-]{36}$/i.test(body.operationId||''))fail('Invalid support send identity.');
 const text=typeof body.text==='string'?body.text.trim():'';if(text.length>2000)fail('Message is too long.');
 return {mime,kind,data,bytes,text};
}

export function createSupportMediaService({request,decode,encode,name,isMaster}){
 const get=async(env,path)=>request(env,path).catch(error=>error.status===404?null:Promise.reject(error));
 const commit=(env,writes)=>request(env,':commit',{method:'POST',body:JSON.stringify({writes})});
 const update=(env,path,fields,condition)=>({update:{name:name(env,path),fields:encode(fields)},...(condition?{currentDocument:condition}:{})});
 const query=async(env,collection,field,value,limit=50)=>{
  const filter=field?{where:{fieldFilter:{field:{fieldPath:field},op:field==='expiresAt'?'LESS_THAN_OR_EQUAL':'EQUAL',value:field==='expiresAt'?{timestampValue:new Date(value).toISOString()}:{stringValue:value}}}}:{};
  const rows=await request(env,':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],...filter,limit}})});
  return rows.filter(row=>row.document).map(row=>row.document);
 };
 const peer=async(env,actor,clientUid)=>{
  if(!uid(clientUid)||(!isMaster(actor)&&actor.uid!==clientUid))fail('This support conversation is not available to your account.',403);
  const owner=await get(env,`/users/${clientUid}`),profile=decode(owner?.fields||{});
  if(!owner||!['client_admin','client_user'].includes(profile.role)||profile.status!=='approved'||profile.subscriptionStatus!=='active'||!uid(profile.tenantId))fail('This support account is unavailable.',403);
  const tenant=await get(env,`/tenants/${profile.tenantId}`);
  if(!tenant||decode(tenant.fields).status!=='active')fail('This workspace is closed or unavailable.',403);
  return {owner,tenant,profile};
 };
 const purgeFile=async(env,document)=>{
  const meta=decode(document.fields||{}),prefix=name(env,'/supportMedia/');
  if(!document.name?.startsWith(prefix)||!Number.isInteger(meta.chunks)||meta.chunks<1||meta.chunks>16)fail('Invalid support cleanup identity.',500);
  const writes=Array.from({length:meta.chunks},(_,i)=>({delete:`${document.name}/chunks/${i}`}));
  writes.push({delete:document.name});await commit(env,writes);
 };
 return {
  async send(env,actor,body,now=Date.now()){
   const file=validateSupportMedia(body),clientUid=String(body.clientUid||actor.uid);
   const {owner,tenant,profile}=await peer(env,actor,clientUid);
   const id=`${actor.uid}_${body.operationId}`,path=`/supportMedia/${id}`;
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',file.bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const existing=await get(env,path);
   if(existing){const old=decode(existing.fields);if(old.senderUid!==actor.uid||old.clientUid!==clientUid||old.tenantId!==profile.tenantId||old.hash!==hash||old.caption!==file.text)fail('Send identity already belongs to a different attachment.',409);if(!Number.isFinite(Date.parse(old.expiresAt))||Date.parse(old.expiresAt)<=now)fail('This attachment has expired.',410);return {success:true,replayed:true,messageId:id,expiresAt:old.expiresAt};}
   // Bound temporary storage even if many clients upload before the next cron.
   if((await query(env,'supportMedia','tenantId',profile.tenantId,20)).length>=20||(await query(env,'supportMedia',null,null,200)).length>=200)fail('Temporary support media is full. Text chat is still available; retry after cleanup.',429);
   const conversationPath=`/supportConversations/${clientUid}`,conversation=await get(env,conversationPath);
   if(conversation&&decode(conversation.fields).tenantId!==profile.tenantId)fail('Support conversation workspace mismatch.',403);
   const expiresAt=new Date(now+SUPPORT_MEDIA_TTL),createdAt=new Date(now);
   const chunks=[]; // Base64 chunks are aligned to four characters.
   const width=4*Math.floor(CHUNK/3);
   for(let i=0;i<file.data.length;i+=width)chunks.push(file.data.slice(i,i+width));
   const meta={clientUid,tenantId:profile.tenantId,senderUid:actor.uid,kind:file.kind,mimeType:file.mime,size:file.bytes.length,hash,caption:file.text,chunks:chunks.length,createdAt,expiresAt};
   const writes=[{verify:owner.name,currentDocument:{updateTime:owner.updateTime}},{verify:tenant.name,currentDocument:{updateTime:tenant.updateTime}},
    update(env,path,meta,{exists:false}),...chunks.map((data,i)=>update(env,`${path}/chunks/${i}`,{data},{exists:false})),
    update(env,`${conversationPath}/messages/${id}`,{text:file.text,senderUid:actor.uid,senderRole:actor.profile.role,clientUid,tenantId:profile.tenantId,createdAt,attachment:{id,kind:file.kind,expiresAt}}, {exists:false}),
    update(env,conversationPath,{clientUid,tenantId:profile.tenantId,clientName:String(profile.name||profile.email||'Client'),clientEmail:String(profile.email||''),lastMessage:file.text||`[${file.kind==='photo'?'Photo':'Audio'}]`,updatedAt:createdAt,unreadForMaster:!isMaster(actor),unreadForClient:isMaster(actor)},conversation?{updateTime:conversation.updateTime}:{exists:false})];
   await commit(env,writes);
   return {success:true,messageId:id,expiresAt:expiresAt.toISOString()};
  },
  async read(env,actor,body,now=Date.now()){
   if(typeof body.id!=='string'||! /^[A-Za-z0-9_-]{1,180}$/.test(body.id))fail('Invalid attachment identity.');
   const document=await get(env,`/supportMedia/${body.id}`);if(!document)fail('This support attachment is no longer available.',410);
   const meta=decode(document.fields),owner=await peer(env,actor,meta.clientUid);
   if(meta.tenantId!==owner.profile.tenantId)fail('Support attachment workspace mismatch.',403);
   if(!Number.isFinite(Date.parse(meta.expiresAt))||Date.parse(meta.expiresAt)<=now)fail('This support attachment has expired.',410);
   if(!Number.isInteger(meta.chunks)||meta.chunks<1||meta.chunks>16)fail('Invalid attachment storage metadata.',500);
   const rows=await request(env,':batchGet',{method:'POST',body:JSON.stringify({documents:Array.from({length:meta.chunks},(_,i)=>`${document.name}/chunks/${i}`)})});
   const chunks=new Map(rows.filter(row=>row.found).map(row=>[row.found.name,decode(row.found.fields).data]));
   const data=Array.from({length:meta.chunks},(_,i)=>chunks.get(`${document.name}/chunks/${i}`));
   if(data.some(value=>typeof value!=='string'))fail('Support attachment download was incomplete.',503);
   return {success:true,mimeType:meta.mimeType,data:data.join(''),expiresAt:meta.expiresAt};
  },
  async purgeExpired(env,now=Date.now()){
   // Metadata/chunks are deleted together. Message text is never aged out.
   const documents=await query(env,'supportMedia','expiresAt',now,20);
   for(const document of documents)await purgeFile(env,document);
   return documents.length;
  },
  async purgeTenant(env,tenantId){
   for(let batch=0;batch<10;batch++){
    const documents=await query(env,'supportMedia','tenantId',tenantId,20);
    if(!documents.length)return;
    for(const document of documents){if(decode(document.fields).tenantId!==tenantId)fail('Support media workspace mismatch.',500);await purgeFile(env,document);}
   }
   fail('Support media cleanup is incomplete; the workspace stays blocked for retry.',503);
  },
  async conversations(env,tenantId){return query(env,'supportConversations','tenantId',tenantId,100);},
 };
}
