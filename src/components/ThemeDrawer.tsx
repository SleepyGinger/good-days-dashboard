"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DayPicker, type DateRange } from "react-day-picker";
import type { Theme } from "@/lib/domain";
import { isoLocal, isoToLocalDate } from "@/lib/dates";
import "react-day-picker/dist/style.css";

export type { Theme } from "@/lib/domain";

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
  const [range, setRange] = useState<DateRange | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const saveLock = useRef(false);
  const newThemeId = useRef("");

  /* when drawer opens, hydrate fields */
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!initial) newThemeId.current = crypto.randomUUID();
    setMonth(initial ? isoToLocalDate(initial.start) : new Date());
    if (initial) {
      setTitle(initial.title);
      setRange({
        from: isoToLocalDate(initial.start),
        to: initial.end ? isoToLocalDate(initial.end) : undefined,
      });
    } else {
      setTitle("");
      setRange(undefined);
    }
  }, [initial, open]);

  const handleSave = async () => {
    if (!title.trim() || !range?.from || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({
      id: initial?.id ?? newThemeId.current,
      title: title.trim(),
      start: isoLocal(range.from),
      end: range.to ? isoLocal(range.to) : null,
      color: initial?.color,
      }, userId);
      onOpenChange(false);
    } catch {
      setError("Couldn’t save this theme. Your changes are still here. Try again.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial?.id || !onDelete || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      await onDelete(initial.id, userId);
      onOpenChange(false);
    } catch {
      setError("Couldn’t delete this theme. Try again.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!saveLock.current) onOpenChange(next); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{initial ? "Edit Theme" : "New Theme"}</DrawerTitle>
        </DrawerHeader>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm opacity-70">Title</label>
            <input
              className="w-full rounded bg-stone-800 p-2 text-sm"
              value={title}
              disabled={saving}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Calendar range picker */}
            <DayPicker
              mode="range"
              selected={range}
              month={month}
              onMonthChange={setMonth}
              disabled={saving}
              // if user clears the range, DayPicker passes undefined – neutralise that
              onSelect={setRange}
              numberOfMonths={1}
              // fall back to today if there's no from‑date yet
              styles={{ day: { borderRadius: "0.5rem" } }}
            />
          <p className="text-xs opacity-60">
            {range?.from
              ? `From ${isoLocal(range.from)} ${
                  range.to ? `to ${isoLocal(range.to)}` : "(open‑ended)"
                }`
              : "Pick a start date"}
          </p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>

        <DrawerFooter className="flex justify-between">
          {initial?.id && onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim() || !range?.from}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
