export const MAX_ENTRY_PHOTOS = 3;

export interface PhotoUploadSnapshot {
  photoUrls: string[];
  pending: boolean;
  error: string | null;
}

/** Owns a draft's uploads independently of React's asynchronous state updates. */
export function createPhotoUploadCoordinator(onChange: (state: PhotoUploadSnapshot) => void) {
  let generation = 0;
  let state: PhotoUploadSnapshot = { photoUrls: [], pending: false, error: null };
  const publish = (next: PhotoUploadSnapshot) => {
    state = next;
    onChange({ ...state, photoUrls: [...state.photoUrls] });
  };

  return {
    getSnapshot(): PhotoUploadSnapshot {
      return { ...state, photoUrls: [...state.photoUrls] };
    },
    beginDraft(photoUrls: string[] = []) {
      generation += 1;
      publish({ photoUrls: [...photoUrls], pending: false, error: null });
    },
    cancelPending() {
      generation += 1;
      publish({ ...state, pending: false });
    },
    removePhoto(index: number) {
      publish({ ...state, photoUrls: state.photoUrls.filter((_, i) => i !== index) });
    },
    getPhotosForSave(): string[] {
      if (state.pending) throw new Error("Wait for the photos to finish uploading before saving.");
      return [...state.photoUrls];
    },
    async upload<T>(items: readonly T[], uploadOne: (item: T, isActive: () => boolean) => Promise<string>, isCurrent = () => true): Promise<boolean> {
      if (state.pending || items.length === 0 || !isCurrent()) return false;
      const selected = items.slice(0, Math.max(0, MAX_ENTRY_PHOTOS - state.photoUrls.length));
      if (selected.length === 0) return false;
      const batchGeneration = generation;
      const active = () => batchGeneration === generation && isCurrent();
      publish({ ...state, pending: true, error: null });
      let failures = 0;

      try {
        for (const item of selected) {
          if (!active()) return false;
          try {
            const url = await uploadOne(item, active);
            if (!active()) return false;
            // Publish each success, so one failure cannot discard other attachments.
            publish({ ...state, photoUrls: [...state.photoUrls, url] });
          } catch {
            if (!active()) return false;
            failures += 1;
          }
        }
        if (failures > 0) {
          publish({ ...state, error: `${failures} photo${failures === 1 ? " could" : "s could"} not be uploaded. Successful photos were kept. Try selecting the failed photos again.` });
        }
        return failures === 0;
      } finally {
        // An old batch must never change a newer draft's pending/error state.
        if (batchGeneration === generation) publish({ ...state, pending: false });
      }
    },
  };
}
