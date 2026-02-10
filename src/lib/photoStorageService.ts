import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const isCapacitor = typeof window !== "undefined" && !!(window as any).Capacitor;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

async function uploadViaRest(
  file: File,
  path: string,
  authToken: string | null
): Promise<string> {
  const contentType = file.type || "image/jpeg";
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodedPath}`;

  const headers: Record<string, string> = { "Content-Type": contentType };
  if (authToken) {
    headers["Authorization"] = `Firebase ${authToken}`;
  }

  const res = await fetch(url, { method: "POST", headers, body: file });
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
  const contentType = file.type || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `photos/${userId}/${dateKey}_${suffix}.${ext}`;

  if (isCapacitor) {
    return uploadViaRest(file, path, authToken ?? null);
  }

  const storage = getStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType });
  return getDownloadURL(storageRef);
}
