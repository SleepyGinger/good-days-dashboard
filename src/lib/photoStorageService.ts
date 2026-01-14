import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export async function uploadPhotoFile(
  file: File,
  userId: string,
  dateKey: string
): Promise<string> {
  // Determine file extension from content type
  const contentType = file.type || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

  // Upload to Firebase Storage
  const storage = getStorage();
  const storageRef = ref(storage, `photos/${userId}/${dateKey}.${ext}`);

  await uploadBytes(storageRef, file, { contentType });

  // Get permanent download URL
  return getDownloadURL(storageRef);
}
