"use client";
import React, { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

export interface Theme {
  id?: string;               // present only when editing
  title: string;
  start: string;             // YYYY‑MM‑DD
  end?: string | null;       // optional
  color?: string;
}

interface ThemeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Theme | null;
  onSave: (t: Theme, userId: string | null) => Promise<void>;
  onDelete?: (id: string, userId: string | null) => Promise<void>;
  userId: string | null;
}

export default function ThemeDrawer({
  open,
  onOpenChange,
  initial,
  onSave,
  onDelete,
  userId,
}: ThemeDrawerProps) {
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});
  const [saving, setSaving] = useState(false);

  /* when drawer opens, hydrate fields */
  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setRange({
        from: new Date(initial.start),
        to: initial.end ? new Date(initial.end) : undefined,
      });
    } else {
      setTitle("");
      setRange({});
    }
  }, [initial]);

  const handleSave = async () => {
    if (!title.trim() || !range.from) return;
    setSaving(true);
    await onSave({
      id: initial?.id, // may be undefined – that's fine
      title: title.trim(),
      start: isoLocal(range.from),
      end: range.to ? isoLocal(range.to) : null,
    }, userId);
    setSaving(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!initial?.id || !onDelete) return;
    await onDelete(initial.id, userId);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{initial ? "Edit Theme" : "New Theme"}</DrawerTitle>
        </DrawerHeader>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm opacity-70">Title</label>
            <input
              className="w-full rounded bg-gray-800 p-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Calendar range picker */}
            <DayPicker
              mode="range"
              selected={range as any}
              // if user clears the range, DayPicker passes undefined – neutralise that
              onSelect={(r) => setRange(r ?? {}) as any}
              numberOfMonths={1}
              // fall back to today if there's no from‑date yet
              defaultMonth={range.from ?? new Date()}
              styles={{ day: { borderRadius: "0.5rem" } }}
            />
          <p className="text-xs opacity-60">
            {range.from
              ? `From ${isoLocal(range.from)} ${
                  range.to ? `to ${isoLocal(range.to)}` : "(open‑ended)"
                }`
              : "Pick a start date"}
          </p>
        </div>

        <DrawerFooter className="flex justify-between">
          {initial?.id && onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Save
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/* utility */
function isoLocal(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
