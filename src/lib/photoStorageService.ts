import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const isCapacitor = typeof window !== "undefined" && !!(window as any).Capacitor;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

/** Resize and compress an image file to JPEG via canvas */
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}

async function uploadViaRest(
  blob: Blob,
  path: string,
  authToken: string | null
): Promise<string> {
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodedPath}`;

  const headers: Record<string, string> = { "Content-Type": "image/jpeg" };
  if (authToken) {
    headers["Authorization"] = `Firebase ${authToken}`;
  }

  const res = await fetch(url, { method: "POST", headers, body: blob });
  if (!res.ok) throw new Error(`Storage REST upload failed: ${res.status}`);

  const meta = await res.json();
  const token = meta.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${token}`;
}

export async function uploadPhotoFile(
  file: File,
  userId: string,
  dateKey: string,
  authToken?: string | null
): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `photos/${userId}/${dateKey}_${suffix}.jpg`;

  // Compress before upload (typically reduces 8MB iPhone photo to ~200-400KB)
  const compressed = await compressImage(file);

  if (isCapacitor) {
    return uploadViaRest(compressed, path, authToken ?? null);
  }

  const storage = getStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, compressed, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}
