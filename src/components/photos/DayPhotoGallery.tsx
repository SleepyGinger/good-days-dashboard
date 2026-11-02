"use client";
/* eslint-disable @next/next/no-img-element -- Capacitor file URLs are displayed directly in the static app. */

import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Capacitor } from "@capacitor/core";
import { X } from "lucide-react";
import PhotoDay, { releasePhotoFiles } from "@/lib/photoDayPlugin";
import type { PhotoDayPhoto } from "@/lib/photoDayPlugin";

export default function DayPhotoGallery({
  photos,
  initialIndex,
  maxSelectable,
  onConfirm,
  onClose,
}: {
  photos: PhotoDayPhoto[];
  initialIndex: number;
  maxSelectable: number;
  onConfirm: (photoIds: string[]) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fullUrls, setFullUrls] = useState<Record<string, string>>({});
  const loadingRef = useRef<Set<string>>(new Set());
  const previewsRef = useRef(new Map<string, { filePath: string; url: string }>());
  const desiredRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const photo = photos[index] ?? photos[0];
  const isSelected = photo ? selected.has(photo.id) : false;
  const atMax = selected.size >= maxSelectable;

  const toggleSelect = () => {
    if (!photo) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photo.id)) {
        next.delete(photo.id);
      } else if (next.size < maxSelectable) {
        next.add(photo.id);
      }
      return next;
    });
  };

  useEffect(() => {
    mountedRef.current = true;
    const previews = previewsRef.current;
    return () => {
      mountedRef.current = false;
      void releasePhotoFiles([...previews.values()].map((preview) => preview.filePath));
      previews.clear();
    };
  }, []);

  useEffect(() => {
    if (index >= photos.length) setIndex(Math.max(0, photos.length - 1));
    setSelected((previous) => new Set([...previous].slice(0, maxSelectable)));
  }, [index, photos.length, maxSelectable]);

  // Load full-size photo for current and adjacent indices
  useEffect(() => {
    const indices = [index - 1, index, index + 1].filter((i) => i >= 0 && i < photos.length);
    desiredRef.current = new Set(indices.map((i) => photos[i].id));
    const obsoletePaths: string[] = [];
    for (const [id, preview] of previewsRef.current) {
      if (!desiredRef.current.has(id)) {
        obsoletePaths.push(preview.filePath);
        previewsRef.current.delete(id);
      }
    }
    void releasePhotoFiles(obsoletePaths);
    setFullUrls(Object.fromEntries([...previewsRef.current].map(([id, preview]) => [id, preview.url])));
    indices
      .forEach(async (i) => {
        const p = photos[i];
        if (loadingRef.current.has(p.id) || previewsRef.current.has(p.id)) return;
        loadingRef.current.add(p.id);
        try {
          const { filePath } = await PhotoDay.getFullPhoto({ id: p.id });
          if (!mountedRef.current || !desiredRef.current.has(p.id)) {
            await releasePhotoFiles([filePath]);
            return;
          }
          const url = Capacitor.convertFileSrc(filePath);
          previewsRef.current.set(p.id, { filePath, url });
          setFullUrls((prev) => ({
            ...prev,
            [p.id]: url,
          }));
        } catch {
          // The existing thumbnail remains usable if a preview cannot be exported.
        } finally {
          loadingRef.current.delete(p.id);
        }
      });
  }, [index, photos]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); // prevent Vaul drawer from capturing touch
    if (e.touches.length === 1) {
      swipeRef.current = { startX: e.touches[0].clientX, moved: false };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation(); // prevent Vaul drawer from capturing touch
    if (swipeRef.current && e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - swipeRef.current.startX);
      if (dx > 10) {
        swipeRef.current.moved = true;
        e.preventDefault(); // prevent iOS back-swipe / scroll
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation(); // prevent Vaul drawer from capturing touch
    if (!swipeRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const diff = swipeRef.current.startX - endX;
    const wasMoved = swipeRef.current.moved;
    swipeRef.current = null;

    if (wasMoved && Math.abs(diff) > 50) {
      if (diff > 0 && index < photos.length - 1) setIndex((i) => i + 1);
      else if (diff < 0 && index > 0) setIndex((i) => i - 1);
    } else if (!wasMoved) {
      // Tap — check for double-tap to toggle selection
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        toggleSelect();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  if (!photo) return null;
  const imgSrc = fullUrls[photo.id] || Capacitor.convertFileSrc(photo.thumbnailPath);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content asChild aria-describedby={undefined}>
          <div
            className="fixed inset-0 z-[9999] bg-black flex flex-col"
            style={{ touchAction: "none", pointerEvents: "auto" }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Dialog.Title className="sr-only">Device photos</Dialog.Title>
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 shrink-0"
              style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
            >
              <button type="button" aria-label="Close device photos" onClick={onClose} className="text-white/70 hover:text-white">
                <X className="w-7 h-7" />
              </button>
              <span className="text-sm text-white/60">
                {index + 1} / {photos.length}
              </span>
              <div className="w-7" />
            </div>

            {/* Photo */}
            <div
              className="flex-1 relative flex items-center justify-center overflow-hidden px-2"
              style={{ touchAction: "none" }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={() => { swipeRef.current = null; }}
            >
              <img
                src={imgSrc}
                alt=""
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
              {/* Selection checkmark overlay */}
              {isSelected && (
                <div className="absolute top-3 right-5 w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div
              className="shrink-0 flex flex-col items-center gap-3 pt-3 px-6"
              style={{
                paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Select / deselect button */}
              <button
                onClick={toggleSelect}
                disabled={!isSelected && atMax}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium ${
                  isSelected
                    ? "bg-orange-600 text-white active:bg-orange-700"
                    : atMax
                      ? "bg-stone-800 text-stone-500"
                      : "bg-stone-800 text-white active:bg-stone-700"
                }`}
              >
                {isSelected ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Selected
                  </>
                ) : atMax ? (
                  `Max ${maxSelectable} selected`
                ) : (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/60" />
                    Select
                  </>
                )}
              </button>

              {/* Upload button — only when there are selections */}
              {selected.size > 0 && (
                <button
                  onClick={() => onConfirm(Array.from(selected))}
                  className="w-full bg-orange-600 text-white py-3 rounded-xl text-sm font-semibold active:bg-orange-700"
                >
                  Upload {selected.size} Photo{selected.size > 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
