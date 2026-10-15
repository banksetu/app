import type { Customer } from "./schema";

// The remote URL identifies the active photo. A different URL must not inherit
// an earlier image or pending upload from this device.
export function mergeRemotePhoto(customer: Customer, previous?: Customer): Customer {
  const samePhoto = previous?.photoUrl === customer.photoUrl && previous?.enrolId === customer.enrolId && (!customer.photoVersion || previous?.photoVersion === customer.photoVersion);
  return {
    ...customer,
    photoVersion: customer.photoVersion || (samePhoto ? previous?.photoVersion : undefined),
    photoRemoved: customer.photoRemoved ?? (samePhoto ? previous?.photoRemoved : undefined),
    photoDataUrl: samePhoto ? previous?.photoDataUrl || customer.photoDataUrl : customer.photoDataUrl,
    photoPreview: customer.photoPreview || (samePhoto ? previous?.photoPreview : "") || "",
  };
}

export function mergeUploadedPhoto(customer: Customer, local: Customer, uploaded: Customer): Customer {
  return {
    ...customer,
    photoRemoved: customer.photoRemoved ?? local.photoRemoved,
    photoContentHash: customer.photoContentHash || uploaded.photoContentHash || local.photoContentHash,
    photoDataUrl: undefined,
    photoPreview: uploaded.photoDataUrl || ((local.photoUrl === customer.photoUrl || (customer.photoContentHash && customer.photoContentHash===local.photoContentHash)) ? local.photoPreview : undefined) || customer.photoPreview || "",
  };
}

export type PhotoIndexEntry = {fileId:string;customerId:string;url:string;version:string;hash?:string;revision:number;deleted:boolean};
export type PhotoIndex = {indexId?:string;revision:number;complete:boolean;checkedAt:number;entries:PhotoIndexEntry[]};
export function drivePhotoId(value:unknown):string {
  const url=String(value||'');return url.match(/\/d\/([\w-]+)/)?.[1]||url.match(/[?&]id=([\w-]+)/)?.[1]||url;
}
export function applyPhotoIndex(state:import('./schema').LocalState):void {
  const index=state.photoIndex;if(!index)return;
  const byId=new Map(index.entries.map(entry=>[entry.fileId,entry]));
  const byCustomer=new Map<string,PhotoIndexEntry>();
  for(const entry of index.entries)if(!entry.deleted&&entry.customerId){const old=byCustomer.get(entry.customerId);if(!old||entry.revision>old.revision)byCustomer.set(entry.customerId,entry);}
  for(const record of state.records){
    if(record.deleted||record.pending)continue;
    const customer=record.customer;
    if(customer.photoRemoved===true){customer.photoPreviousPreview ||= customer.photoPreview;customer.photoPreview='';customer.photoDataUrl=undefined;customer.photoAvailable=false;customer.photoState='NO_PHOTO';continue;}
    const id=drivePhotoId(customer.photoUrl),entry=id?byId.get(id):customer.photoRemoved?undefined:byCustomer.get(String(customer.enrolId||'').trim().replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100));
    if(entry&&!entry.deleted){
      if(customer.photoVersion!==entry.version||drivePhotoId(customer.photoUrl)!==entry.fileId){
        // A legacy preview needs one bounded, persisted checksum comparison.
        // Never trust a same URL alone when the content may have been replaced.
        const legacy=customer.photoVersion===undefined&&drivePhotoId(customer.photoUrl)===entry.fileId&&!!customer.photoPreview;
        if(legacy&&entry.hash&&!customer.photoContentHash){customer.photoNeedsBaselineHash=true;customer.photoState='INDEXING';continue;}
        const baseline=legacy&&!!entry.hash&&customer.photoContentHash===entry.hash;
        if(!baseline){customer.photoPreviousPreview ||= customer.photoPreview;customer.photoPreview='';customer.photoDataUrl=undefined;}
        customer.photoNeedsBaselineHash=false;
        customer.photoUrl=entry.url;customer.photoVersion=entry.version;
        record.photoMissingRef=undefined;record.photoRetryAt=undefined;record.photoFailures=undefined;record.photoLastError=undefined;record.photoCheckedAt=undefined;
      }
      customer.photoIndexWaiting=false;customer.photoAvailable=true;customer.photoState=customer.photoPreview?'SYNCED':'PENDING_DOWNLOAD';
    }else if(index.complete){
      // Absence is proven only by a completed baseline/change checkpoint.
      if(!id||entry?.deleted){if(entry?.deleted){customer.photoPreviousPreview ||= customer.photoPreview;customer.photoPreview='';customer.photoDataUrl=undefined;}customer.photoAvailable=false;customer.photoState='NO_PHOTO';record.photoMissingRef=`${customer.enrolId||''}|${customer.photoUrl||''}|${customer.photoVersion||''}`;record.photoRetryAt=undefined;record.photoFailures=undefined;record.photoLastError=undefined;}
      // A valid URL absent from the index remains recoverable, never NO_PHOTO.
    }
  }
}

export async function photoBytesHash(dataUrl:string):Promise<string> {
 const encoded=dataUrl.split(',')[1]||'';
 const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
}
