"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  RefreshCcw,
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
} from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { motion } from "framer-motion";

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  off,
  set,
  push,
  remove,
} from "firebase/database";

import ThemeDrawer, { Theme } from "./ThemeDrawer";

/* ───────────────────────────────────────────────────────────── */
/* 1. Firebase init                                             */
/* ───────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyCOGsJMsgjvHmXJ7j17hzrsHDCjKmwaGQA",
  authDomain: "good-days-5515e.firebaseapp.com",
  databaseURL: "https://good-days-5515e-default-rtdb.firebaseio.com",
  projectId: "good-days-5515e",
  storageBucket: "good-days-5515e.appspot.com",
  messagingSenderId: "50443495976",
  appId: "1:50443495976:web:16e4d1fac4a23cda83631d",
  measurementId: "G-WXFZ6CSKPJ",
};

let backend: "firebase" | "local" = "firebase";
let db: ReturnType<typeof getDatabase> | null = null;

try {
  const app: FirebaseApp = initializeApp(firebaseConfig);
  db = getDatabase(app); // if this succeeds, RTDB is reachable
} catch (err) {
  console.warn("⚠️ Firebase DB unavailable, falling back to localStorage", err);
  backend = "local";
}

/* ───────────────────────────────────────────────────────────── */
/* 2. LocalStorage fallback helpers                              */
/* ───────────────────────────────────────────────────────────── */
const LS_ENTRY_KEY = "moodData";
const LS_THEME_KEY = "themes";

function readLocal<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function writeLocal<T>(key: string, obj: Record<string, T>) {
  localStorage.setItem(key, JSON.stringify(obj));
  window.dispatchEvent(new Event("storage"));
}

/* ───────────────────────────────────────────────────────────── */
/* 3. Types & date helpers                                       */
/* ───────────────────────────────────────────────────────────── */
interface Entry {
  date: string; // yyyy‑mm‑dd
  day: "Good day" | "Bad day";
  energy: "Energized" | "Tired";
  touch: "Touching" | "No Touching";
  note: string;
}
interface Grouped {
  date: string;
  items: Entry[];
}

/* Fast ISO helpers that stay in local timezone */
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}
function isoToLocalDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)); // local midnight
}
function localDateToIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToKey(iso: string) {
  return iso.replace(/-/g, "");
}

/* ───────────────────────────────────────────────────────────── */
/* 4. Entries: subscribe / upsert                                */
/* ───────────────────────────────────────────────────────────── */
function subscribeEntries(cb: (raw: Record<string, Entry>) => void) {
  if (backend === "firebase" && db) {
    const node = ref(db, "moodData");
    const unsub = onValue(node, (snap) => cb(snap.val() ?? {}));
    return () => off(node, "value", unsub);
  }
  const handler = () => cb(readLocal<Entry>(LS_ENTRY_KEY));
  handler();
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

async function upsertEntry(entry: Entry) {
  const key = isoToKey(entry.date);
  if (backend === "firebase" && db) {
    await set(ref(db, `moodData/${key}`), entry);
  } else {
    const all = readLocal<Entry>(LS_ENTRY_KEY);
    all[key] = entry;
    writeLocal(LS_ENTRY_KEY, all);
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 5. Themes: subscribe / CRUD                                   */
/* ───────────────────────────────────────────────────────────── */
function defaultColor() {
  return "#93c5fd"; // pastel indigo‑300
}

function subscribeThemes(cb: (t: Theme[]) => void) {
  if (backend === "firebase" && db) {
    const node = ref(db, "themes");
    const unsub = onValue(node, (snap) => {
      const raw: Record<string, any> = snap.val() ?? {};
      const arr = Object.entries(raw).map(([id, v]) => ({
        id,
        ...v,
      })) as Theme[];
      cb(arr);
    });
    return () => off(node, "value", unsub);
  }
  const handler = () => {
    const raw = readLocal<Theme>(LS_THEME_KEY);
    const arr = Object.entries(raw).map(([id, v]) => ({
      id,
      ...v,
    })) as Theme[];
    cb(arr);
  };
  handler();
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

async function saveTheme(t: Theme) {
  const { id, ...data } = { ...t, color: t.color || defaultColor() };
  if (backend === "firebase" && db) {
    if (id) await set(ref(db, `themes/${id}`), data); // UPDATE
    else await set(push(ref(db, "themes")), data); // CREATE
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    if (id) all[id] = { id, ...data };
    else all[(data as any)._id || crypto.randomUUID()] = { ...data };
    writeLocal(LS_THEME_KEY, all);
  }
}

async function deleteTheme(id: string) {
  if (backend === "firebase" && db) {
    await remove(ref(db, `themes/${id}`));
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    delete all[id];
    writeLocal(LS_THEME_KEY, all);
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 6. Custom hooks                                               */
/* ───────────────────────────────────────────────────────────── */
function useEntries() {
  const [byDate, setByDate] = useState<Grouped[]>([]);
  useEffect(() => {
    const unsub = subscribeEntries((raw) => {
      const m = new Map<string, Entry[]>();
      Object.values(raw).forEach((e: any) => {
        if (!e.date) return;
        m.set(e.date, [...(m.get(e.date) ?? []), e as Entry]);
      });
      const sorted = Array.from(m.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, items]) => ({ date, items }));
      setByDate(sorted);
    });
    return unsub;
  }, []);
  return byDate;
}
function useThemes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  useEffect(() => subscribeThemes(setThemes), []);
  return themes;
}

/* ───────────────────────────────────────────────────────────── */
/* 7. Main component                                             */
/* ───────────────────────────────────────────────────────────── */
export default function GoodDaysDashboard() {
  // ensure dark mode once per mount
  useEffect(() => document.documentElement.classList.add("dark"), []);

  /* --- data --- */
  const byDate = useEntries();
  const themes = useThemes();

  /* --- random banner --- */
  const [rand, setRand] = useState<Grouped | null>(null);
  useEffect(() => {
    if (byDate.length)
      setRand(byDate[Math.floor(Math.random() * byDate.length)]);
  }, [byDate]);

  /* --- drawers state --- */
  const [addOpen, setAddOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<Grouped | null>(null);

  /* --- theme drawer --- */
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);

  /* --- new entry form state --- */
  const [entryDate, setEntryDate] = useState(isoLocal());
  const [day, setDay] = useState<"Good day" | "Bad day">("Good day");
  const [energy, setEnergy] = useState<"Energized" | "Tired">("Energized");
  const [touch, setTouch] = useState<"Touching" | "No Touching">("Touching");
  const [note, setNote] = useState("");

  const saveEntry = async () => {
    await upsertEntry({ date: entryDate, day, energy, touch, note });
    setDay("Good day");
    setEnergy("Energized");
    setTouch("Touching");
    setNote("");
    setEntryDate(isoLocal());
    setAddOpen(false);
  };

  /* --- calendar helpers --- */
  const daysWithNotes = byDate.map((g) => isoToLocalDate(g.date));
  const modifiers = { hasData: daysWithNotes };
  const modifiersClassNames = { hasData: "bg-indigo-600 text-white" };
  const [month, setMonth] = useState(
    () => new Date(daysWithNotes[0] ?? new Date())
  );
  const prevMonth = () =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  /* --- stats --- */
  const longest = longestStreak(byDate.map((g) => g.date));
  const percentGood = goodDayRate(byDate);

  /* --- ribbon packing (up‑to‑2 rows per week) --- */
  const ribbons = packThemes(themes, month);

  /* ── JSX ──────────────────────────────────────── */
  return (
    <div className="dark bg-gray-900 min-h-screen text-gray-100 p-4">
      {/* centre the dashboard column */}
      <main className="mx-auto max-w-screen-sm flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Good Days</h1>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setEditingTheme(null);
                setThemeDrawerOpen(true);
              }}
              className="flex gap-2"
            >
              <CalendarPlus size={16} /> Themes
            </Button>
            {byDate.length > 0 && (
              <Button
                variant="ghost"
                onClick={() =>
                  setRand(byDate[Math.floor(Math.random() * byDate.length)])
                }
                className="flex gap-2"
              >
                <RefreshCcw size={16} /> Random Day
              </Button>
            )}
          </div>
        </header>

        {/* Random banner */}
        {rand && (
          <motion.div
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-600/20 p-4 rounded-2xl shadow-md space-y-2"
          >
            <div className="flex items-center gap-2 text-indigo-300">
              <CalendarDays size={18} />
              <span className="uppercase tracking-wider text-xs">
                {formatDate(rand.date)}
              </span>
            </div>
            <p className="line-clamp-3 text-sm opacity-90">
              {rand.items[0]?.note || "(no note)"}
            </p>
            <Button size="sm" onClick={() => openDrawer(rand)}>
              View full day
            </Button>
          </motion.div>
        )}

        {/* Stats */}
        <section className="grid sm:grid-cols-3 gap-4">
          <StatCard label="Days Logged" value={byDate.length} />
          <StatCard label="Longest Streak" value={longest} />
          <StatCard label="% Good Days" value={percentGood} />
        </section>

        {/* Calendar */}
        <section className="flex justify-center">
          <div className="relative bg-gray-800 rounded-lg p-4">
            {/* ribbons */}
            {ribbons.map((r) => (
              <div
                key={r.key}
                title={r.title}
                onClick={() => {
                  const t = themes.find((th) => th.id === r.id);
                  if (t) {
                    setEditingTheme(t);
                    setThemeDrawerOpen(true);
                  }
                }}
                className="absolute"
                style={{
                  top: 32 + r.row * 40, // DayPicker grid starts ~32px down
                  height: 8,
                  left: `${r.left}%`,
                  width: `${r.width}%`,
                  backgroundColor: r.color,
                  opacity: 0.3,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              />
            ))}

            {/* custom month nav */}
            <div className="flex items-center justify-between mb-2">
              <Button size="icon" variant="ghost" onClick={prevMonth}>
                <ChevronLeft />
              </Button>
              <p className="font-medium">
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <Button size="icon" variant="ghost" onClick={nextMonth}>
                <ChevronRight />
              </Button>
            </div>

            {/* DayPicker grid */}
            <DayPicker
              className="mx-auto"
              month={month}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              onDayClick={(day) => {
                const iso = localDateToIso(day);
                const g = byDate.find((d) => d.date === iso);
                if (g) openDrawer(g);
              }}
              /* ⬇️ ADD "as any" to silence TS on this non‑standard override */
              components={{ Caption: () => null } as any}
              classNames={{ nav: "hidden" }}
              styles={{
                head_cell: { color: "white" },
                day: { borderRadius: "0.5rem" },
              }}
            />

            {byDate.length === 0 && (
              <p className="text-center text-sm opacity-60 pt-4">
                No data yet. Start logging!
              </p>
            )}
          </div>
        </section>

        {/* New Entry Drawer */}
        <Drawer open={addOpen} onOpenChange={setAddOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>New Entry</DrawerTitle>
            </DrawerHeader>

            <div className="p-6 space-y-6">
              <ToggleRow
                label="Day"
                left="Good day"
                right="Bad day"
                value={day}
                onChange={setDay}
              />
              <ToggleRow
                label="Energy"
                left="Energized"
                right="Tired"
                value={energy}
                onChange={setEnergy}
              />
              <ToggleRow
                label="Touch"
                left="Touching"
                right="No Touching"
                value={touch}
                onChange={setTouch}
              />

              <div className="space-y-2">
                <label className="text-sm opacity-70">Note</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened today?"
                />
              </div>
            </div>

            <DrawerFooter className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveEntry}>Save</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* View Drawer */}
        <Drawer open={viewOpen} onOpenChange={setViewOpen}>
          {drawerData && (
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{formatDate(drawerData.date)}</DrawerTitle>
              </DrawerHeader>
              <div className="p-6 space-y-4">
                {drawerData.items.map((item, i) => (
                  <Card key={i} className="bg-gray-800">
                    <CardContent className="p-4 space-y-2 text-sm">
                      <p>
                        Day: <strong>{item.day}</strong>
                      </p>
                      <p>
                        Energy: <strong>{item.energy}</strong>
                      </p>
                      <p>
                        Touch: <strong>{item.touch}</strong>
                      </p>
                      {item.note && (
                        <p className="pt-1 whitespace-pre-wrap">{item.note}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DrawerContent>
          )}
        </Drawer>

        {/* Theme Drawer */}
        <ThemeDrawer
          open={themeDrawerOpen}
          onOpenChange={(b) => {
            setThemeDrawerOpen(b);
            if (!b) setEditingTheme(null);
          }}
          initial={editingTheme}
          onSave={saveTheme}
          onDelete={editingTheme?.id ? deleteTheme : undefined}
        />
      </main>

      {/* Floating + new entry */}
      <Button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full p-0 bg-indigo-600 hover:bg-indigo-500"
      >
        <Plus />
      </Button>
    </div>
  );

  /* helper to open view drawer */
  function openDrawer(g: Grouped) {
    setDrawerData(g);
    setViewOpen(true);
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 8. UI helper components                                       */
/* ───────────────────────────────────────────────────────────── */
function ToggleRow<T extends string>({
  label,
  left,
  right,
  value,
  onChange,
}: {
  label: string;
  left: T;
  right: T;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm opacity-70">{label}</p>
      <div className="flex gap-2">
        {[left, right].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-1 rounded-full text-xs ${
              value === opt
                ? "bg-indigo-600 text-white"
                : "bg-gray-700 text-gray-300"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="bg-gray-800">
      <CardContent className="p-4 space-y-1">
        <p className="text-xs opacity-60">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* 9. Analytics helpers & streak / % good days                   */
/* ───────────────────────────────────────────────────────────── */
function formatDate(dateIso: string, withYear = true) {
  const opts = withYear
    ? {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    : { weekday: "short", month: "short", day: "numeric" };
  return new Date(dateIso).toLocaleDateString(undefined, opts as any);
}

function longestStreak(dateIsos: string[]) {
  if (!dateIsos.length) return 0;
  const days = dateIsos
    .map((d) => new Date(d).setHours(0, 0, 0, 0))
    .sort((a, b) => a - b);
  let max = 1,
    cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = days[i] - days[i - 1];
    if (diff === 86_400_000) {
      cur += 1;
      max = Math.max(max, cur);
    } else if (diff > 0) cur = 1;
  }
  return max;
}

function goodDayRate(groups: Grouped[]) {
  if (!groups.length) return "–";
  const total = groups.length;
  const good = groups.filter((g) =>
    g.items.some((i) => i.day === "Good day")
  ).length;
  return ((good / total) * 100).toFixed(0) + "%";
}

/* ───────────────────────────────────────────────────────────── */
/* 10. Theme ribbon helpers  (unlimited rows, max 2 per row)     */
/* ───────────────────────────────────────────────────────────── */

/* First grid day shown by DayPicker (Sunday before the 1st) */
function startOfCalendar(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const dow = first.getDay(); // 0 = Sun … 6 = Sat
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow);
}

function packThemes(themes: Theme[], month: Date) {
  const gridStart = startOfCalendar(month).getTime();
  const oneDayMs = 86_400_000;

  /* track how many ribbons already occupy a given row index */
  const rowUsage: Record<number, number> = {};

  const segments: {
    key: string;
    id: string;
    title: string;
    row: number; // 0,1,2,…
    left: number; // %
    width: number; // %
    color: string;
  }[] = [];

  themes
    .sort((a, b) => a.start.localeCompare(b.start))
    .forEach((t) => {
      const color = t.color || defaultColor();
      let cursor = isoToLocalDate(t.start).getTime(); // theme pointer
      const end = t.end ? isoToLocalDate(t.end).getTime() : cursor;

      while (cursor <= end) {
        /* locate this slice in the calendar grid */
        const offsetDays = Math.round((cursor - gridStart) / oneDayMs);
        const row = Math.floor(offsetDays / 7); // grid row index
        const col = offsetDays % 7; // day-of-week col

        /* enforce max 2 ribbons per row */
        if ((rowUsage[row] ?? 0) >= 2) {
          /* skip remainder of this week */
          cursor += (7 - col) * oneDayMs;
          continue;
        }

        /* how far can this slice extend inside the current week row? */
        const themeRemain = Math.round((end - cursor) / oneDayMs) + 1;
        const rowRemain = 7 - col;
        const spanDays = Math.min(themeRemain, rowRemain);

        segments.push({
          key: (t.id || t.title) + "-" + cursor,
          id: t.id || "",
          title: t.title,
          row,
          left: (col / 7) * 100,
          width: (spanDays / 7) * 100,
          color,
        });

        rowUsage[row] = (rowUsage[row] ?? 0) + 1;
        cursor += spanDays * oneDayMs; // advance
      }
    });

  return segments;
}
