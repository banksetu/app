import { getAuth } from "firebase/auth";
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/** A small Firestore document works across Web, Electron and Android and
 * uses existing authenticated transport/persistent Firebase offline cache.
 * No new sync engine, Cloud Storage bucket, or tenant-shared mapping. */
export const PROFILE_AVATAR_LIMIT_BYTES = 10 * 1024;
const DATA_URL = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
export type ProfileAvatar = {imageDataUrl: string; updatedAt?: unknown};

function avatarDoc(uid: string) {
  if (!uid || uid.includes("/")) throw new Error("Invalid profile identity.");
  return doc(db, "profileAvatars", uid);
}

function measureDataUrl(dataUrl: string): number {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return Number.POSITIVE_INFINITY;
  const encoded = match[2];
  const padding = (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  return Math.floor(encoded.length * 3 / 4) - padding;
}

export function subscribeMyProfileAvatar(
  uid: string,
  onUpdate: (imageDataUrl: string | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (getAuth().currentUser?.uid !== uid) return () => {};
  return onSnapshot(avatarDoc(uid), snapshot => {
    if (getAuth().currentUser?.uid !== uid) return;
    const image = snapshot.exists() ? snapshot.data()?.imageDataUrl : null;
    onUpdate(typeof image === "string" && measureDataUrl(image) <= PROFILE_AVATAR_LIMIT_BYTES ? image : null);
  }, error => onError?.(error));
}

/**
 * Produce a centered square photo within 10 KiB including its actual encoded
 * byte count. Never upload the raw original or persist it in localStorage.
 */
export async function optimizeProfileAvatar(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 15 * 1024 * 1024)
    throw new Error("Select a JPG, PNG or WebP image under 15 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Unable to read this image.");
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    const offsetX = Math.floor((image.naturalWidth-edge)/2);
    const offsetY = Math.floor((image.naturalHeight-edge)/2);
    for (const dimension of [128,112,96,80,64,48]) {
      const canvas = document.createElement("canvas");
      canvas.width = dimension;
      canvas.height = dimension;
      const ctx = canvas.getContext("2d", {alpha:false});
      if (!ctx) throw new Error("Image optimization is unavailable on this device.");
      ctx.fillStyle = "#e8eef6";
      ctx.fillRect(0,0,dimension,dimension);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image,offsetX,offsetY,edge,edge,0,0,dimension,dimension);
      for (const type of ["image/webp","image/jpeg"] as const) {
        for (const quality of [.82,.72,.62,.50,.38,.27]) {
          const output = canvas.toDataURL(type,quality);
          if (DATA_URL.test(output) && measureDataUrl(output) <= PROFILE_AVATAR_LIMIT_BYTES)
            return output;
        }
      }
    }
    throw new Error("Could not optimize this photo to 10 KB. Choose a clearer, simpler image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function saveMyProfileAvatar(uid: string, imageDataUrl: string): Promise<void> {
  if (getAuth().currentUser?.uid !== uid) throw new Error("Sign in to update your profile photo.");
  if (!DATA_URL.test(imageDataUrl) || measureDataUrl(imageDataUrl) > PROFILE_AVATAR_LIMIT_BYTES)
    throw new Error("Photo must be a WebP or JPEG image of 10 KB or less.");
  await setDoc(avatarDoc(uid), {imageDataUrl, updatedAt:serverTimestamp()});
}

export async function removeMyProfileAvatar(uid: string): Promise<void> {
  if (getAuth().currentUser?.uid !== uid) throw new Error("Sign in to remove your profile photo.");
  await deleteDoc(avatarDoc(uid));
}
