"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getIdToken } from "@/lib/authService";
import PhotoDay, { releasePhotoFiles } from "@/lib/photoDayPlugin";
import { uploadPhotoFile } from "@/lib/photoStorageService";
import { createPhotoUploadCoordinator, type PhotoUploadSnapshot } from "@/lib/photoUploadCoordinator";

export function useEntryPhotos({ userId, dateKey }: { userId: string | null; dateKey: string }) {
  const [state, setState] = useState<PhotoUploadSnapshot>({ photoUrls: [], pending: false, error: null });
  const currentContext = useRef({ userId, dateKey });
  const previousUser = useRef(userId);
  const mounted = useRef(true);
  currentContext.current = { userId, dateKey };
  const coordinatorRef = useRef<ReturnType<typeof createPhotoUploadCoordinator> | null>(null);
  if (!coordinatorRef.current) coordinatorRef.current = createPhotoUploadCoordinator((next) => {
    if (mounted.current) setState(next);
  });
  const coordinator = coordinatorRef.current;

  useEffect(() => {
    // Changing a date retains already attached photos but invalidates in-flight work.
    if (previousUser.current !== userId) coordinator.beginDraft();
    else coordinator.cancelPending();
    previousUser.current = userId;
  }, [coordinator, userId, dateKey]);
  useEffect(() => {
    mounted.current = true;
    setState(coordinator.getSnapshot());
    return () => { mounted.current = false; coordinator.cancelPending(); };
  }, [coordinator]);

  const upload = async <T,>(items: readonly T[], loadFile: (item: T) => Promise<File>) => {
    const context = { ...currentContext.current };
    if (!context.userId) return false;
    const isCurrent = () => currentContext.current.userId === context.userId && currentContext.current.dateKey === context.dateKey;
    return coordinator.upload(items, async (item, isActive) => {
      const file = await loadFile(item);
      if (!isActive()) throw new Error("This entry has changed.");
      const token = await getIdToken();
      if (!isActive()) throw new Error("This entry has changed.");
      return uploadPhotoFile(file, context.userId!, context.dateKey, token);
    }, isCurrent);
  };

  return {
    ...state,
    beginDraft: coordinator.beginDraft,
    removePhoto: coordinator.removePhoto,
    getPhotosForSave: coordinator.getPhotosForSave,
    uploadFiles: (files: FileList | File[]) => upload(Array.from(files), async (file) => file),
    uploadFromDevice: (ids: string[]) => upload(ids, async (id) => {
      const { filePath } = await PhotoDay.getFullPhoto({ id });
      try {
        const response = await fetch(Capacitor.convertFileSrc(filePath));
        if (!response.ok) throw new Error("Unable to read the selected photo.");
        const blob = await response.blob();
        return new File([blob], `day-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      } finally {
        await releasePhotoFiles([filePath]);
      }
    }),
  };
}
