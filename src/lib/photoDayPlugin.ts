import { registerPlugin } from "@capacitor/core";

export interface PhotoDayPhoto {
  id: string;
  thumbnailPath: string;
}

export interface PhotoDayPlugin {
  checkPermissions(): Promise<{ photos: "granted" | "denied" | "prompt" | "limited" }>;
  requestPermissions(): Promise<{ photos: "granted" | "denied" | "prompt" | "limited" }>;
  getPhotosForDate(options: { date: string }): Promise<{ photos: PhotoDayPhoto[] }>;
  getFullPhoto(options: { id: string }): Promise<{ filePath: string }>;
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
    } as unknown as PhotoDayPlugin;
  },
});

export default PhotoDay;
