import { registerPlugin } from "@capacitor/core";

export interface PhotoDayPhoto {
  id: string;
  thumbnailPath: string;
}

export interface PhotoDayPlugin {
  checkPermissions(): Promise<{ photos: "granted" | "denied" | "prompt" | "limited" }>;
  requestPermissions(): Promise<{ photos: "granted" | "denied" | "prompt" | "limited" }>;
  getPhotosForDate(options: { date: string; offset?: number }): Promise<{ photos: PhotoDayPhoto[]; hasMore?: boolean; nextOffset?: number }>;
  getFullPhoto(options: { id: string }): Promise<{ filePath: string }>;
  releasePhotos(options: { filePaths: string[] }): Promise<void>;
}

const PhotoDay = registerPlugin<PhotoDayPlugin>("PhotoDay", {
  web: () => {
    return {
      checkPermissions: async () => {
        throw new Error("PhotoDay plugin is not available on web");
      },
      requestPermissions: async () => {
        throw new Error("PhotoDay plugin is not available on web");
      },
      getPhotosForDate: async () => {
        throw new Error("PhotoDay plugin is not available on web");
      },
      getFullPhoto: async () => {
        throw new Error("PhotoDay plugin is not available on web");
      },
      releasePhotos: async () => {},
    } as unknown as PhotoDayPlugin;
  },
});

/** Cleanup is best-effort, and the native side restricts paths to its own cache. */
export async function releasePhotoFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;
  try { await PhotoDay.releasePhotos({ filePaths }); }
  catch (error) { console.warn("Unable to release temporary photo files:", error); }
}

export default PhotoDay;
