/* eslint-disable @next/next/no-img-element -- Firebase photo URLs are already compressed and served directly. */
"use client";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Card, CardContent } from "@/components/ui/card";
import { getEntryPhotos, type GroupedEntry } from "@/lib/domain";
import { formatDate } from "@/lib/dates";

export default function EntryViewer({ entry, onClose, onPhoto }: { entry: GroupedEntry; onClose: () => void; onPhoto: (url: string) => void }) {
  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DrawerContent aria-describedby={undefined}>
      <DrawerHeader><DrawerTitle>{formatDate(entry.date)}</DrawerTitle></DrawerHeader>
      <div className="p-6 space-y-4 overflow-y-auto">
        {entry.items.map((item, index) => <Card key={index} className="bg-stone-800"><CardContent className="p-4 space-y-3 text-sm">
          {getEntryPhotos(item).length > 0 && <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-2 px-2">
            {getEntryPhotos(item).map((url, photoIndex) => <img key={url} src={url} alt={`Photo ${photoIndex + 1}`}
              className="flex-shrink-0 w-full max-h-[60vh] object-contain rounded-lg cursor-pointer snap-center"
              style={{ minWidth: "calc(100% - 0.5rem)" }} onClick={() => onPhoto(url)} />)}
          </div>}
          {item.note && <p className="whitespace-pre-wrap text-base">{item.note}</p>}
          <div className="flex items-center gap-4 text-xs opacity-70 pt-2 border-t border-stone-700"><span>{item.day}</span><span>{item.energy}</span><span>{item.touch}</span></div>
        </CardContent></Card>)}
      </div>
    </DrawerContent>
  </Drawer>;
}
