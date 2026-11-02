/* eslint-disable @next/next/no-img-element -- Photos include native file URLs and Firebase download URLs. */
"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { DayPicker } from "react-day-picker";
import { CalendarDays, ImagePlus, Loader2, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import DayPhotoGallery from "@/components/photos/DayPhotoGallery";
import PhotoLightbox from "@/components/photos/PhotoLightbox";
import { useDayPhotos } from "@/hooks/useDayPhotos";
import { useEntryPhotos } from "@/hooks/useEntryPhotos";
import { isNativePlatform } from "@/lib/authService";
import { upsertEntry } from "@/lib/dataService";
import { isoLocal, isoToKey, isoToLocalDate } from "@/lib/dates";
import { getEntryPhotos, type Entry } from "@/lib/domain";
import { assertEntryDestination } from "@/lib/entryDraft";

interface Props {
  date: string;
  initial?: Entry;
  userId: string;
  existingDates: string[];
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

export default function EntryEditor({ date, initial, userId, existingDates, onClose, onSaved }: Props) {
  const [entryDate, setEntryDate] = useState(date);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDayPhotos, setShowDayPhotos] = useState(true);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photos = useEntryPhotos({ userId, dateKey: isoToKey(entryDate) });
  const dayPhotos = useDayPhotos({ date: entryDate, open: true });
  const { beginDraft } = photos;

  useEffect(() => {
    beginDraft(initial ? getEntryPhotos(initial) : []);
  }, [beginDraft, initial]);

  const close = () => {
    if (saveLock.current || photos.pending) return;
    beginDraft();
    onClose();
  };

  const save = async () => {
    if (saveLock.current) return;
    setError(null);
    try {
      assertEntryDestination(entryDate, initial?.date, existingDates);
      // This synchronous guard also protects a click before pending state renders.
      const photoUrls = photos.getPhotosForSave();
      const entry: Entry = {
        date: entryDate,
        day: initial?.day ?? "Good day",
        energy: initial?.energy ?? "Energized",
        touch: initial?.touch ?? "Touching",
        note,
        ...(photoUrls.length ? { photoUrls } : {}),
      };
      saveLock.current = true;
      setSaving(true);
      await upsertEntry(entry, userId);
      onSaved(entry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save this entry. Your changes are still here.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const confirmGallery = async (ids: string[]) => {
    if (saveLock.current) return;
    setGalleryIndex(null);
    if (await photos.uploadFromDevice(ids)) setShowDayPhotos(false);
  };

  return (
    <>
      <Drawer open onOpenChange={(open) => { if (!open && galleryIndex === null && enlargedPhoto === null) close(); }}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader><DrawerTitle>{initial ? "Edit Entry" : "New Entry"}</DrawerTitle></DrawerHeader>
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="space-y-2 relative">
              <label className="text-sm opacity-70">Date</label>
              <button type="button" disabled={saving || photos.pending}
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full rounded bg-stone-800 p-2 text-sm text-white text-left flex items-center justify-between disabled:opacity-60">
                <span>{isoToLocalDate(entryDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                <CalendarDays className="w-4 h-4 opacity-70" />
              </button>
              {showDatePicker && (
                <div className="absolute z-50 mt-1 bg-stone-800 rounded-lg shadow-xl border border-stone-700">
                  <DayPicker mode="single" selected={isoToLocalDate(entryDate)} onSelect={(selected) => {
                    if (selected) {
                      try {
                        assertEntryDestination(isoLocal(selected), initial?.date, existingDates);
                        setEntryDate(isoLocal(selected)); setGalleryIndex(null); setError(null);
                      } catch (cause) { setError((cause as Error).message); }
                    }
                    setShowDatePicker(false);
                  }} styles={{ day: { borderRadius: "0.5rem" } }} />
                </div>
              )}
            </div>

            {isNativePlatform() && (
              <div>
                {photos.photoUrls.length > 0 && !showDayPhotos ? (
                  <button type="button" onClick={() => setShowDayPhotos(true)} className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300">
                    <ImagePlus className="w-4 h-4" /> Browse device photos
                  </button>
                ) : (
                  <>
                    <p className="text-sm opacity-70">Photos from this Day</p>
                    {dayPhotos.permission === "denied" ? (
                      <p className="mt-2 text-sm text-stone-500">Photo access denied. Enable in Settings &gt; Good Days &gt; Photos.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-4 gap-1.5 mt-2 max-h-48 overflow-y-auto">
                          {dayPhotos.photos.map((photo, index) => (
                            <button key={photo.id} type="button" disabled={saving || photos.pending || photos.photoUrls.length >= 3}
                              onClick={() => setGalleryIndex(index)} className="relative aspect-square rounded-lg overflow-hidden disabled:opacity-50"
                              aria-label={`Choose device photo ${index + 1}`}>
                              <img src={Capacitor.convertFileSrc(photo.thumbnailPath)} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                        {dayPhotos.loading && <p className="flex items-center gap-2 mt-2 text-sm text-stone-400"><Loader2 className="w-4 h-4 animate-spin" />Loading photos…</p>}
                        {!dayPhotos.loading && !dayPhotos.error && dayPhotos.photos.length === 0 && <p className="mt-2 text-sm text-stone-500">No photos found for this date.</p>}
                        {dayPhotos.hasMore && <Button size="sm" variant="ghost" disabled={dayPhotos.loading} onClick={() => void dayPhotos.loadMore()}>Load more photos</Button>}
                      </>
                    )}
                    {dayPhotos.error && <p role="alert" className="text-sm text-red-300">{dayPhotos.error}</p>}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm opacity-70">Photo{photos.photoUrls.length > 1 ? "s" : ""} ({photos.photoUrls.length}/3)</p>
              <input type="file" ref={inputRef} accept="image/*" multiple hidden onChange={async (event) => {
                if (saveLock.current) return;
                const files = Array.from(event.target.files ?? []);
                await photos.uploadFiles(files);
                if (inputRef.current) inputRef.current.value = "";
              }} />
              <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
                {photos.photoUrls.map((url, index) => (
                  <div key={url} className="relative flex-shrink-0 snap-center">
                    <img src={url} alt={`Photo ${index + 1}`} className="w-32 h-48 object-cover rounded-lg cursor-pointer" onClick={() => setEnlargedPhoto(url)} />
                    <button type="button" disabled={saving || photos.pending} aria-label={`Remove photo ${index + 1}`}
                      onClick={() => { if (confirm("Remove this photo?")) photos.removePhoto(index); }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {photos.photoUrls.length < 3 && (
                  <Button type="button" variant="outline" disabled={saving || photos.pending} onClick={() => inputRef.current?.click()} className="flex items-center gap-2">
                    {photos.pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {photos.pending ? "Uploading…" : "Add Photo"}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="entry-note" className="text-sm opacity-70">Note</label>
              <Textarea id="entry-note" value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} placeholder="What happened today?" />
            </div>
          </div>
          <DrawerFooter className="flex flex-col gap-2 shrink-0">
            {(error || photos.error) && <p role="alert" className="text-sm text-red-300">{error || photos.error}</p>}
            <Button onClick={save} disabled={saving || photos.pending} className="w-full">{saving ? "Saving…" : photos.pending ? "Uploading photos…" : "Save"}</Button>
            <Button variant="ghost" onClick={close} disabled={saving || photos.pending} className="w-full">Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      {enlargedPhoto && <PhotoLightbox src={enlargedPhoto} onClose={() => setEnlargedPhoto(null)} />}
      {galleryIndex !== null && dayPhotos.photos.length > 0 && <DayPhotoGallery photos={dayPhotos.photos} initialIndex={galleryIndex}
        maxSelectable={3 - photos.photoUrls.length} onConfirm={confirmGallery} onClose={() => setGalleryIndex(null)} />}
    </>
  );
}
