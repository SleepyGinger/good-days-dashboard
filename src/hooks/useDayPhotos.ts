"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNativePlatform } from "@/lib/authService";
import PhotoDay, { releasePhotoFiles, type PhotoDayPhoto } from "@/lib/photoDayPlugin";

type PhotoPermission = "granted" | "denied" | "prompt" | "limited";
interface RequestState {
  active: boolean;
  date: string;
  offset: number;
  loading: boolean;
  files: Set<string>;
}

export function useDayPhotos({ date, open }: { date: string; open: boolean }) {
  const [photos, setPhotos] = useState<PhotoDayPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<PhotoPermission>("prompt");
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const requestRef = useRef<RequestState | null>(null);

  const fetchPage = useCallback(async (request: RequestState) => {
    if (!request.active || request.loading) return;
    request.loading = true;
    setLoading(true);
    setError(null);
    try {
      const offset = request.offset;
      const result = await PhotoDay.getPhotosForDate({ date: request.date, offset });
      const paths = result.photos.map((photo) => photo.thumbnailPath);
      if (!request.active) { await releasePhotoFiles(paths); return; }
      paths.forEach((path) => request.files.add(path));
      setPhotos((previous) => offset === 0 ? result.photos : [...previous, ...result.photos]);
      request.offset = result.nextOffset ?? request.offset + result.photos.length;
      setHasMore(result.hasMore ?? false);
    } catch {
      if (request.active) setError("Photos could not be loaded. Try reopening this entry.");
    } finally {
      request.loading = false;
      if (request.active) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPhotos([]);
    setHasMore(false);
    setError(null);
    setLoading(false);
    if (!isNativePlatform() || !open || !date) return;
    const request: RequestState = { active: true, date, offset: 0, loading: false, files: new Set() };
    requestRef.current = request;
    setLoading(true);
    void (async () => {
      try {
        let result = await PhotoDay.checkPermissions();
        if (!request.active) return;
        if (result.photos === "prompt") result = await PhotoDay.requestPermissions();
        if (!request.active) return;
        setPermission(result.photos);
        if (result.photos === "granted" || result.photos === "limited") await fetchPage(request);
        else setLoading(false);
      } catch {
        if (request.active) { setError("Photo access could not be checked. Try reopening this entry."); setLoading(false); }
      }
    })();
    return () => {
      request.active = false;
      requestRef.current = null;
      void releasePhotoFiles([...request.files]);
    };
  }, [date, open, fetchPage]);

  return { photos, loading, permission, error, hasMore, loadMore: () => {
    const request = requestRef.current;
    if (request && hasMore) return fetchPage(request);
    return Promise.resolve();
  } };
}
