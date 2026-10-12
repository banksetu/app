import type { Customer } from "./schema";

// The remote URL identifies the active photo. A different URL must not inherit
// an earlier image or pending upload from this device.
export function mergeRemotePhoto(customer: Customer, previous?: Customer): Customer {
  const samePhoto = previous?.photoUrl === customer.photoUrl && previous?.enrolId === customer.enrolId;
  return {
    ...customer,
    photoDataUrl: samePhoto ? previous?.photoDataUrl || customer.photoDataUrl : customer.photoDataUrl,
    photoPreview: customer.photoPreview || (samePhoto ? previous?.photoPreview : "") || "",
  };
}

export function mergeUploadedPhoto(customer: Customer, local: Customer, uploaded: Customer): Customer {
  return {
    ...customer,
    photoDataUrl: undefined,
    photoPreview: uploaded.photoDataUrl || (local.photoUrl === customer.photoUrl ? local.photoPreview : undefined) || customer.photoPreview || "",
  };
}
