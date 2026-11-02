"use client";
/* eslint-disable @next/next/no-img-element -- Photo URLs must work directly in the static Capacitor app. */

import React, { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export default function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const gestureRef = useRef<{
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    isPinch: boolean;
  } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      gestureRef.current = {
        startDist: Math.hypot(dx, dy),
        startScale: scale,
        startX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        startY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        startTx: translate.x,
        startTy: translate.y,
        isPinch: true,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      gestureRef.current = {
        startDist: 0,
        startScale: scale,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: translate.x,
        startTy: translate.y,
        isPinch: false,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!gestureRef.current) return;
    if (e.touches.length === 2 && gestureRef.current.isPinch) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(
        Math.max(gestureRef.current.startScale * (dist / gestureRef.current.startDist), 1),
        5,
      );
      setScale(newScale);

      // pan while pinching
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setTranslate({
        x: gestureRef.current.startTx + midX - gestureRef.current.startX,
        y: gestureRef.current.startTy + midY - gestureRef.current.startY,
      });
    } else if (e.touches.length === 1 && !gestureRef.current.isPinch && scale > 1) {
      const dx = e.touches[0].clientX - gestureRef.current.startX;
      const dy = e.touches[0].clientY - gestureRef.current.startY;
      setTranslate({
        x: gestureRef.current.startTx + dx,
        y: gestureRef.current.startTy + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    gestureRef.current = null;
    if (scale <= 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content asChild aria-describedby={undefined}>
          <div
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            style={{ touchAction: "none", pointerEvents: "auto" }}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onClick={() => {
              if (scale <= 1) onClose();
            }}
          >
            <Dialog.Title className="sr-only">Photo</Dialog.Title>
            <button
              type="button"
              aria-label="Close photo"
              className="absolute right-4 text-white/70 hover:text-white z-10"
              style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={src}
              alt="Enlarged photo"
              className="w-full h-full object-contain"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transition: gestureRef.current ? "none" : "transform 0.2s ease-out",
              }}
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
