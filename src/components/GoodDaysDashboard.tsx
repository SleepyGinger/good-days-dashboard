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

import ThemeDrawer, { Theme } from "./ThemeDrawer";

// Firebase types only - actual imports are done dynamically
import type { FirebaseApp } from "firebase/app";
import type { User } from "firebase/auth";

/* ───────────────────────────────────────────────────────────── */
/* 1. Firebase init                                             */
/* ───────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyCOGsJMsgjvHmXJ7j17hzrsHDCjKmwaGQA",
  authDomain: "good-days-5515e.firebaseapp.com",
  databaseURL: "https://good-days-5515e-default-rtdb.firebaseio.com",
  projectId: "good-days-5515e",
  storageBucket: "good-days-5515e.firebasestorage.app",
  messagingSenderId: "50443495976",
  appId: "1:50443495976:web:16e4d1fac4a23cda83631d",
  measurementId: "G-WXFZ6CSKPJ"
};

let backend: "firebase" | "local" = "local";
let db: any = null;
let auth: any = null;
let firebaseInitialized = false;
let firebaseModules: {
  ref: any;
  onValue: any;
  off: any;
  set: any;
  push: any;
  remove: any;
  GoogleAuthProvider: any;
  signInWithPopup: any;
  signOut: any;
  onAuthStateChanged: any;
} | null = null;

async function initFirebase() {
  if (firebaseInitialized) return;
  if (typeof window === "undefined") return;

  firebaseInitialized = true;
  try {
    const [appModule, dbModule, authModule] = await Promise.all([
      import("firebase/app"),
      import("firebase/database"),
      import("firebase/auth"),
    ]);

    const app = appModule.initializeApp(firebaseConfig);
    db = dbModule.getDatabase(app);
    auth = authModule.getAuth(app);
    firebaseModules = {
      ref: dbModule.ref,
      onValue: dbModule.onValue,
      off: dbModule.off,
      set: dbModule.set,
      push: dbModule.push,
      remove: dbModule.remove,
      GoogleAuthProvider: authModule.GoogleAuthProvider,
      signInWithPopup: authModule.signInWithPopup,
      signOut: authModule.signOut,
      onAuthStateChanged: authModule.onAuthStateChanged,
    };
    backend = "firebase";
  } catch (err) {
    console.warn("⚠️ Firebase unavailable, falling back to localStorage", err);
    backend = "local";
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 2. LocalStorage fallback helpers                              */
/* ───────────────────────────────────────────────────────────── */
const LS_ENTRY_KEY = "moodData";
const LS_THEME_KEY = "themes";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined" && typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
}

function readLocal<T>(key: string): Record<string, T> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function writeLocal<T>(key: string, obj: Record<string, T>) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(obj));
    window.dispatchEvent(new Event("storage"));
  } catch {
    // ignore storage errors
  }
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
function subscribeEntries(cb: (raw: Record<string, Entry>) => void, userId: string | null) {
  if (backend === "firebase" && db && firebaseModules) {
    // Use root-level moodData path
    const node = firebaseModules.ref(db, `moodData`);
    const unsub = firebaseModules.onValue(node, (snap: any) => cb(snap.val() ?? {}));
    return () => firebaseModules!.off(node, "value", unsub);
  }
  if (!isBrowser()) return () => {};
  const handler = () => cb(readLocal<Entry>(LS_ENTRY_KEY));
  handler();
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

async function upsertEntry(entry: Entry, userId: string | null) {
  const key = isoToKey(entry.date);
  if (backend === "firebase" && db && firebaseModules) {
    // Use root-level moodData path
    await firebaseModules.set(firebaseModules.ref(db, `moodData/${key}`), entry);
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

function subscribeThemes(cb: (t: Theme[]) => void, userId: string | null) {
  if (backend === "firebase" && db && firebaseModules) {
    // Use root-level themes path
    const node = firebaseModules.ref(db, `themes`);
    const unsub = firebaseModules.onValue(node, (snap: any) => {
      const raw: Record<string, any> = snap.val() ?? {};
      const arr = Object.entries(raw).map(([id, v]) => ({
        id,
        ...v,
      })) as Theme[];
      cb(arr);
    });
    return () => firebaseModules!.off(node, "value", unsub);
  }
  if (!isBrowser()) return () => {};
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

async function saveTheme(t: Theme, userId: string | null) {
  const { id, ...data } = { ...t, color: t.color || defaultColor() };
  if (backend === "firebase" && db && firebaseModules) {
    // Use root-level themes path
    if (id) await firebaseModules.set(firebaseModules.ref(db, `themes/${id}`), data); // UPDATE
    else await firebaseModules.set(firebaseModules.push(firebaseModules.ref(db, `themes`)), data); // CREATE
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    if (id) all[id] = { id, ...data };
    else all[(data as any)._id || crypto.randomUUID()] = { ...data };
    writeLocal(LS_THEME_KEY, all);
  }
}

async function deleteTheme(id: string, userId: string | null) {
  if (backend === "firebase" && db && firebaseModules) {
    // Use root-level themes path
    await firebaseModules.remove(firebaseModules.ref(db, `themes/${id}`));
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    delete all[id];
    writeLocal(LS_THEME_KEY, all);
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 6. Custom hooks                                               */
/* ───────────────────────────────────────────────────────────── */
function useAuth(firebaseReady: boolean) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("useAuth effect", { firebaseReady, auth: !!auth, firebaseModules: !!firebaseModules });
    if (!firebaseReady || !auth || !firebaseModules) {
      if (firebaseReady) setLoading(false);
      return;
    }

    console.log("Setting up onAuthStateChanged listener");
    const unsubscribe = firebaseModules.onAuthStateChanged(auth, (user: User | null) => {
      console.log("Auth state changed:", user?.email ?? "null");
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseReady]);

  const signInWithGoogle = async () => {
    console.log("signInWithGoogle called", { auth: !!auth, firebaseModules: !!firebaseModules });
    if (!auth || !firebaseModules) {
      console.error("Firebase not ready");
      return;
    }
    const provider = new firebaseModules.GoogleAuthProvider();
    try {
      console.log("Calling signInWithPopup...");
      const result = await firebaseModules.signInWithPopup(auth, provider);
      console.log("Sign in successful:", result.user?.email);
      // Manually update user state after successful sign-in
      setUser(result.user);
      setLoading(false);
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  const logout = async () => {
    if (!auth || !firebaseModules) return;
    try {
      await firebaseModules.signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return { user, loading, signInWithGoogle, logout };
}

function useEntries(userId: string | null, firebaseReady: boolean) {
  const [byDate, setByDate] = useState<Grouped[]>([]);
  useEffect(() => {
    if (!firebaseReady || !firebaseModules) return;
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
    }, userId);
    return unsub;
  }, [userId, firebaseReady]);
  return byDate;
}

function useThemes(userId: string | null, firebaseReady: boolean) {
  const [themes, setThemes] = useState<Theme[]>([]);
  useEffect(() => {
    if (!firebaseReady || !firebaseModules) return;
    return subscribeThemes(setThemes, userId);
  }, [userId, firebaseReady]);
  return themes;
}

/* ───────────────────────────────────────────────────────────── */
/* 7. Main component                                             */
/* ───────────────────────────────────────────────────────────── */
export default function GoodDaysDashboard() {
  const [firebaseReady, setFirebaseReady] = useState(false);

  // Initialize Firebase on mount
  useEffect(() => {
    initFirebase().then(() => setFirebaseReady(true));
  }, []);

  // ensure dark mode once per mount
  useEffect(() => document.documentElement.classList.add("dark"), []);

  /* --- auth --- */
  const { user, loading, signInWithGoogle, logout } = useAuth(firebaseReady);

  /* --- data --- */
  const byDate = useEntries(user?.uid ?? null, firebaseReady);
  const themes = useThemes(user?.uid ?? null, firebaseReady);

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
  const [entryDate, setEntryDate] = useState("");
  const [day, setDay] = useState<"Good day" | "Bad day">("Good day");
  const [energy, setEnergy] = useState<"Energized" | "Tired">("Energized");
  const [touch, setTouch] = useState<"Touching" | "No Touching">("Touching");
  const [note, setNote] = useState("");

  // Set initial entryDate on client only to avoid hydration mismatch
  useEffect(() => {
    if (!entryDate) setEntryDate(isoLocal());
  }, []);

  const saveEntry = async () => {
    await upsertEntry({ date: entryDate, day, energy, touch, note }, user?.uid ?? null);
    setDay("Good day");
    setEnergy("Energized");
    setTouch("Touching");
    setNote("");
    setEntryDate(isoLocal());
    setAddOpen(false);
  };

  /* --- calendar helpers --- */
  const daysWithNotes = byDate.map((g) => isoToLocalDate(g.date));

  // Get all dates covered by themes
  const themeDates = themes.flatMap((t) => {
    const dates: Date[] = [];
    const start = isoToLocalDate(t.start);
    const end = t.end ? isoToLocalDate(t.end) : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  });

  const modifiers = { hasData: daysWithNotes, hasTheme: themeDates };
  const modifiersClassNames = {
    hasData: "bg-indigo-600 text-white",
    hasTheme: "ring-2 ring-indigo-400 ring-inset"
  };
  const [month, setMonth] = useState<Date | null>(null);

  // Set initial month on client only to avoid hydration mismatch
  useEffect(() => {
    if (!month) {
      setMonth(daysWithNotes[0] ?? new Date());
    }
  }, [daysWithNotes]);

  const prevMonth = () =>
    setMonth((m) => m ? new Date(m.getFullYear(), m.getMonth() - 1, 1) : new Date());
  const nextMonth = () =>
    setMonth((m) => m ? new Date(m.getFullYear(), m.getMonth() + 1, 1) : new Date());

  /* --- stats --- */
  const longest = longestStreak(byDate.map((g) => g.date));
  const percentGood = goodDayRate(byDate);


  /* ── JSX ──────────────────────────────────────── */
  if (loading) {
    return (
      <div className="dark bg-gray-900 min-h-screen text-gray-100 p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dark bg-gray-900 min-h-screen text-gray-100 p-4 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Good Days</h1>
          <p className="text-gray-400">Please sign in to continue</p>
          <Button onClick={signInWithGoogle} className="bg-indigo-600 hover:bg-indigo-500">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark bg-gray-900 min-h-screen text-gray-100 p-4">
      {/* centre the dashboard column */}
      <main className="mx-auto max-w-screen-sm flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Good Days</h1>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={logout}
              className="flex gap-2"
            >
              Sign Out
            </Button>
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
              <span className="uppercase tracking-wider text-xs" suppressHydrationWarning>
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

            {/* custom month nav */}
            {month && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Button size="icon" variant="ghost" onClick={prevMonth}>
                    <ChevronLeft />
                  </Button>
                  <p className="font-medium" suppressHydrationWarning>
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
                    // Check if this day is part of a theme
                    const theme = themes.find((t) => {
                      const start = t.start;
                      const end = t.end || t.start;
                      return iso >= start && iso <= end;
                    });
                    if (theme) {
                      setEditingTheme(theme);
                      setThemeDrawerOpen(true);
                      return;
                    }
                    // Open entry drawer for this date (pre-fill if entry exists)
                    const g = byDate.find((d) => d.date === iso);
                    setEntryDate(iso);
                    if (g && g.items[0]) {
                      // Pre-fill with existing entry data
                      setDay(g.items[0].day);
                      setEnergy(g.items[0].energy);
                      setTouch(g.items[0].touch);
                      setNote(g.items[0].note || "");
                    } else {
                      // Reset to defaults for new entry
                      setDay("Good day");
                      setEnergy("Energized");
                      setTouch("Touching");
                      setNote("");
                    }
                    setAddOpen(true);
                  }}
                  /* ⬇️ ADD "as any" to silence TS on this non‑standard override */
                  components={{ Caption: () => null } as any}
                  classNames={{ nav: "hidden" }}
                  styles={{
                    head_cell: { color: "white" },
                    day: { borderRadius: "0.5rem" },
                  }}
                />
              </>
            )}

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

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="space-y-2">
                <label className="text-sm opacity-70">Date</label>
                <input
                  type="date"
                  className="w-full rounded bg-gray-800 p-2 text-sm text-white"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>

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

            <DrawerFooter className="flex justify-end gap-2 shrink-0">
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
                <DrawerTitle suppressHydrationWarning>{formatDate(drawerData.date)}</DrawerTitle>
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
          userId={user?.uid ?? null}
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
/* 10. Theme ribbon helpers  (unlimited rows, max 2 per row)     */
/* ───────────────────────────────────────────────────────────── */

/* First grid day shown by DayPicker (Sunday before the 1st) */
function startOfCalendar(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const dow = first.getDay(); // 0 = Sun … 6 = Sat
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow);
}

function packThemes(themes: Theme[], month: Date) {
  const gridStart = startOfCalendar(month).getTime();
  const oneDayMs = 86_400_000;

  // Calculate the end of the calendar grid (6 weeks = 42 days)
  const gridEnd = gridStart + (42 * oneDayMs);

  console.log("packThemes called", {
    month: month.toISOString(),
    gridStart: new Date(gridStart).toISOString(),
    gridEnd: new Date(gridEnd).toISOString(),
    themesCount: themes.length
  });

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
      const themeStart = isoToLocalDate(t.start).getTime();
      const themeEnd = t.end ? isoToLocalDate(t.end).getTime() : themeStart;

      // Skip themes that don't overlap with the current calendar view
      if (themeEnd < gridStart || themeStart >= gridEnd) return;

      // Clamp cursor to the visible grid
      let cursor = Math.max(themeStart, gridStart);
      const end = Math.min(themeEnd, gridEnd - oneDayMs);

      while (cursor <= end) {
        /* locate this slice in the calendar grid */
        const offsetDays = Math.round((cursor - gridStart) / oneDayMs);
        const row = Math.floor(offsetDays / 7); // grid row index
        const col = offsetDays % 7; // day-of-week col

        // Skip if row is out of bounds (0-5 for 6 weeks)
        if (row < 0 || row > 5) {
          cursor += oneDayMs;
          continue;
        }

        /* enforce max 2 ribbons per row */
        if ((rowUsage[row] ?? 0) >= 2) {
          /* skip remainder of this week */
          cursor += (7 - col) * oneDayMs;
          continue;
        }

        /* how far can this slice extend inside the current week row? */
        const themeRemain = Math.round((end - cursor) / oneDayMs) + 1;
        const rowRemain = 7 - col;
        const spanDays = Math.min(themeRemain, rowRemain);

        const segment = {
          key: (t.id || t.title) + "-" + cursor,
          id: t.id || "",
          title: t.title,
          row,
          left: (col / 7) * 100,
          width: (spanDays / 7) * 100,
          color,
        };
        console.log("Adding ribbon segment", {
          title: t.title,
          cursorDate: new Date(cursor).toISOString(),
          offsetDays,
          row,
          col,
          spanDays,
          left: segment.left,
          width: segment.width
        });
        segments.push(segment);

        rowUsage[row] = (rowUsage[row] ?? 0) + 1;
        cursor += spanDays * oneDayMs; // advance
      }
    });

  return segments;
}
