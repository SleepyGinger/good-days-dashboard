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
  Sparkles,
  Loader2,
  ImagePlus,
  X,
} from "lucide-react";
import { uploadPhotoFile } from "@/lib/photoStorageService";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { motion } from "framer-motion";

import ThemeDrawer, { Theme } from "./ThemeDrawer";
import Celebration from "./Celebration";

// Firebase types only - actual imports are done dynamically
import type { FirebaseApp } from "firebase/app";
import type { User } from "firebase/auth";

/* ───────────────────────────────────────────────────────────── */
/* 1. Firebase init                                             */
/* ───────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
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
  signInAnonymously: any;
  signOut: any;
  onAuthStateChanged: any;
} | null = null;

async function initFirebase() {
  if (firebaseInitialized) return;
  if (typeof window === "undefined") return;

  firebaseInitialized = true;
  try {
    // Add a timeout so Firebase init doesn't hang forever (e.g. in Capacitor WebView)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firebase init timed out")), 5000)
    );
    const init = (async () => {
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
        signInAnonymously: authModule.signInAnonymously,
        signOut: authModule.signOut,
        onAuthStateChanged: authModule.onAuthStateChanged,
      };
      backend = "firebase";
    })();

    await Promise.race([init, timeout]);
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
const LS_SENTIMENT_KEY = "sentimentData";

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
  photoUrl?: string; // legacy single photo
  photoUrls?: string[]; // multiple photos (up to 3)
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

// Helper to get photos from entry (handles legacy photoUrl and new photoUrls)
function getEntryPhotos(entry: Entry): string[] {
  if (entry.photoUrls && entry.photoUrls.length > 0) return entry.photoUrls;
  if (entry.photoUrl) return [entry.photoUrl];
  return [];
}

/* ───────────────────────────────────────────────────────────── */
/* 4. Firebase REST API helpers (for Capacitor)                  */
/* ───────────────────────────────────────────────────────────── */
const FIREBASE_DB_URL = firebaseConfig.databaseURL;
const FIREBASE_API_KEY = firebaseConfig.apiKey;

// Firebase REST auth token (obtained via Identity Toolkit REST API)
let restAuthToken: string | null = null;

async function firebaseRestSignIn(email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Firebase REST sign-in failed: ${res.status}`);
  const data = await res.json();
  restAuthToken = data.idToken;
  return data;
}

function authParam() {
  return restAuthToken ? `?auth=${restAuthToken}` : "";
}

async function firebaseRestGet(path: string) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authParam()}`);
  if (!res.ok) throw new Error(`Firebase REST GET ${path} failed: ${res.status}`);
  return res.json();
}

async function firebaseRestPut(path: string, data: any) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authParam()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase REST PUT ${path} failed: ${res.status}`);
  return res.json();
}

async function firebaseRestPost(path: string, data: any) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authParam()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase REST POST ${path} failed: ${res.status}`);
  return res.json();
}

async function firebaseRestDelete(path: string) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authParam()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Firebase REST DELETE ${path} failed: ${res.status}`);
}

const isCapacitorEnv = typeof window !== "undefined" && !!(window as any).Capacitor;

/* ───────────────────────────────────────────────────────────── */
/* 5. Entries: subscribe / upsert                                */
/* ───────────────────────────────────────────────────────────── */
function subscribeEntries(cb: (raw: Record<string, Entry>) => void, userId: string | null) {
  if (isCapacitorEnv) {
    // Capacitor: poll Firebase REST API
    let active = true;
    const poll = async () => {
      try {
        const data = await firebaseRestGet("moodData");
        if (active) cb(data ?? {});
      } catch (err) {
        console.error("REST subscribeEntries error:", err);
        if (active) cb(readLocal<Entry>(LS_ENTRY_KEY));
      }
    };
    poll();
    const interval = setInterval(poll, 30000); // refresh every 30s
    return () => { active = false; clearInterval(interval); };
  }
  if (backend === "firebase" && db && firebaseModules) {
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
  if (isCapacitorEnv) {
    try {
      await firebaseRestPut(`moodData/${key}`, entry);
      return;
    } catch (err) {
      console.error("REST upsertEntry error:", err);
    }
  }
  if (backend === "firebase" && db && firebaseModules) {
    await firebaseModules.set(firebaseModules.ref(db, `moodData/${key}`), entry);
  } else {
    const all = readLocal<Entry>(LS_ENTRY_KEY);
    all[key] = entry;
    writeLocal(LS_ENTRY_KEY, all);
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 6. Themes: subscribe / CRUD                                   */
/* ───────────────────────────────────────────────────────────── */
function defaultColor() {
  return "#93c5fd"; // pastel indigo‑300
}

function subscribeThemes(cb: (t: Theme[]) => void, userId: string | null) {
  if (isCapacitorEnv) {
    let active = true;
    const poll = async () => {
      try {
        const raw: Record<string, any> = (await firebaseRestGet("themes")) ?? {};
        const arr = Object.entries(raw).map(([id, v]) => ({ id, ...v })) as Theme[];
        if (active) cb(arr);
      } catch (err) {
        console.error("REST subscribeThemes error:", err);
        if (active) {
          const raw = readLocal<Theme>(LS_THEME_KEY);
          cb(Object.entries(raw).map(([id, v]) => ({ id, ...v })) as Theme[]);
        }
      }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => { active = false; clearInterval(interval); };
  }
  if (backend === "firebase" && db && firebaseModules) {
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
  if (isCapacitorEnv) {
    try {
      if (id) await firebaseRestPut(`themes/${id}`, data);
      else await firebaseRestPost("themes", data);
      return;
    } catch (err) {
      console.error("REST saveTheme error:", err);
    }
  }
  if (backend === "firebase" && db && firebaseModules) {
    if (id) await firebaseModules.set(firebaseModules.ref(db, `themes/${id}`), data);
    else await firebaseModules.set(firebaseModules.push(firebaseModules.ref(db, `themes`)), data);
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    if (id) all[id] = { id, ...data };
    else all[(data as any)._id || crypto.randomUUID()] = { ...data };
    writeLocal(LS_THEME_KEY, all);
  }
}

async function deleteTheme(id: string, userId: string | null) {
  if (isCapacitorEnv) {
    try {
      await firebaseRestDelete(`themes/${id}`);
      return;
    } catch (err) {
      console.error("REST deleteTheme error:", err);
    }
  }
  if (backend === "firebase" && db && firebaseModules) {
    await firebaseModules.remove(firebaseModules.ref(db, `themes/${id}`));
  } else {
    const all = readLocal<Theme>(LS_THEME_KEY);
    delete all[id];
    writeLocal(LS_THEME_KEY, all);
  }
}

// Sentiment data persistence (keyed by YYYY-MM)
type SentimentData = { grade: string; summary: string };

async function saveSentiment(monthKey: string, data: SentimentData) {
  if (isCapacitorEnv) {
    try { await firebaseRestPut(`sentimentData/${monthKey}`, data); return; }
    catch (err) { console.error("REST saveSentiment error:", err); }
  }
  if (backend === "firebase" && db && firebaseModules) {
    await firebaseModules.set(firebaseModules.ref(db, `sentimentData/${monthKey}`), data);
  } else {
    const all = readLocal<SentimentData>(LS_SENTIMENT_KEY);
    all[monthKey] = data;
    writeLocal(LS_SENTIMENT_KEY, all);
  }
}

async function loadSentiment(monthKey: string): Promise<SentimentData | null> {
  if (isCapacitorEnv) {
    try { return await firebaseRestGet(`sentimentData/${monthKey}`); }
    catch (err) { console.error("REST loadSentiment error:", err); }
  }
  if (backend === "firebase" && db && firebaseModules) {
    return new Promise((resolve) => {
      const node = firebaseModules!.ref(db, `sentimentData/${monthKey}`);
      firebaseModules!.onValue(node, (snap: any) => {
        resolve(snap.val() ?? null);
      }, { onlyOnce: true });
    });
  } else {
    const all = readLocal<SentimentData>(LS_SENTIMENT_KEY);
    return all[monthKey] ?? null;
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 6. Custom hooks                                               */
/* ───────────────────────────────────────────────────────────── */
function useAuth(firebaseReady: boolean) {
  const isCapacitor = typeof window !== "undefined" && !!(window as any).Capacitor;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("useAuth effect", { firebaseReady, auth: !!auth, firebaseModules: !!firebaseModules, isCapacitor });

    // In Capacitor, sign in via Firebase REST API (SDK auth doesn't work in WebViews)
    if (isCapacitor && firebaseReady) {
      const email = process.env.NEXT_PUBLIC_IOS_AUTH_EMAIL;
      const password = process.env.NEXT_PUBLIC_IOS_AUTH_PASSWORD;
      if (email && password) {
        console.log("Capacitor: signing in via REST API...");
        firebaseRestSignIn(email, password)
          .then((data) => {
            console.log("REST sign-in succeeded:", data.email);
            setUser({ uid: data.localId, email: data.email } as any);
            setLoading(false);
          })
          .catch((err) => {
            console.error("REST sign-in failed:", err);
            setUser({ uid: "capacitor-local", email: "local@device" } as any);
            setLoading(false);
          });
      } else {
        console.log("Capacitor: no credentials, using stub user");
        setUser({ uid: "capacitor-local", email: "local@device" } as any);
        setLoading(false);
      }
      return;
    }

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
    if (!firebaseReady) return;
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
    if (!firebaseReady) return;
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

  /* --- celebration screen --- */
  const [showCelebration, setShowCelebration] = useState(false);
  const [savedDayType, setSavedDayType] = useState<"Good day" | "Bad day">("Good day");

  /* --- new entry form state --- */
  const [entryDate, setEntryDate] = useState("");
  const [day, setDay] = useState<"Good day" | "Bad day">("Good day");
  const [energy, setEnergy] = useState<"Energized" | "Tired">("Energized");
  const [touch, setTouch] = useState<"Touching" | "No Touching">("Touching");
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  // Set initial entryDate on client only to avoid hydration mismatch
  useEffect(() => {
    if (!entryDate) setEntryDate(isoLocal());
  }, []);

  const saveEntry = async () => {
    await upsertEntry({ date: entryDate, day, energy, touch, note, ...(photoUrls.length > 0 && { photoUrls }) }, user?.uid ?? null);
    // Store the day type for the celebration screen
    setSavedDayType(day);
    // Close the drawer and show celebration
    setAddOpen(false);
    setShowCelebration(true);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (photoUrls.length >= 3) return; // Max 3 photos

    setPhotoLoading(true);
    try {
      const dateKey = isoToKey(entryDate);
      const permanentUrl = await uploadPhotoFile(file, user.uid, dateKey);
      setPhotoUrls(prev => [...prev, permanentUrl]);
    } catch (error) {
      console.error('Photo upload error:', error);
    } finally {
      setPhotoLoading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    // Reset form after celebration
    setDay("Good day");
    setEnergy("Energized");
    setTouch("Touching");
    setNote("");
    setPhotoUrls([]);
    setEntryDate(isoLocal());
  };

  // Dev shortcut: press 'c' to preview celebration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' && !addOpen && !viewOpen && !themeDrawerOpen) {
        setShowCelebration(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addOpen, viewOpen, themeDrawerOpen]);

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
    hasData: "bg-orange-700 text-white",
    hasTheme: "ring-2 ring-lime-700 ring-inset"
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

  /* --- sentiment analysis --- */
  const [sentimentData, setSentimentData] = useState<{
    grade: string;
    summary: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Sentiment storage key (single key for rolling 60-day window)
  const now = new Date();
  const sentimentKey = "last60";

  // Calculate date 60 days ago
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoIso = isoLocal(sixtyDaysAgo);

  // Load saved sentiment once Firebase is ready
  useEffect(() => {
    if (!firebaseReady) return;
    loadSentiment(sentimentKey).then((data) => {
      if (data) setSentimentData(data);
    });
  }, [sentimentKey, firebaseReady]);

  const analyzeSentiment = async () => {
    // Get entries from last 60 days with notes
    const recentNotes = byDate
      .filter((g) => g.date >= sixtyDaysAgoIso && g.items[0]?.note)
      .map((g) => ({ date: g.date, note: g.items[0].note }));

    if (recentNotes.length === 0) {
      alert("No notes found in the last 60 days to analyze.");
      return;
    }

    setAnalyzing(true);
    try {
      let data: { grade: string; summary: string };

      const clientApiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
      if (clientApiKey) {
        // Direct API call (Capacitor / personal builds)
        const notesText = recentNotes
          .map((n) => `${n.date}: ${n.note}`)
          .join("\n\n");

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": clientApiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 512,
            messages: [
              {
                role: "user",
                content: `Analyze the following journal entries from the last 60 days and provide:
1. A letter grade for the overall mood (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F)
2. A brief evocative summary (2-3 sentences) that captures the overall vibe, themes, and emotional arc of this period

Journal entries:
${notesText}

Respond in JSON format only:
{"grade": "<letter>", "summary": "<string>"}`,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Analysis failed");
        const msg = await res.json();
        const text = msg.content?.find((c: any) => c.type === "text")?.text;
        if (!text) throw new Error("No text response from Claude");
        data = JSON.parse(text);
      } else {
        // Server-side API route (web deployment)
        const apiUrl = process.env.NEXT_PUBLIC_SENTIMENT_API_URL || "/api/analyze-sentiment";
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: recentNotes }),
        });
        if (!res.ok) throw new Error("Analysis failed");
        data = await res.json();
      }

      setSentimentData(data);
      // Save to Firebase/localStorage
      await saveSentiment(sentimentKey, data);
    } catch (err) {
      console.error("Sentiment analysis error:", err);
      alert("Failed to analyze sentiment. Make sure ANTHROPIC_API_KEY is set.");
    } finally {
      setAnalyzing(false);
    }
  };


  /* ── JSX ──────────────────────────────────────── */
  if (loading) {
    return (
      <div className="dark bg-stone-900 min-h-screen text-stone-100 p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dark bg-stone-900 min-h-screen text-stone-100 p-4 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Good Days</h1>
          <p className="text-stone-400">Please sign in to continue</p>
          <Button onClick={signInWithGoogle} className="bg-orange-700 hover:bg-orange-600">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark bg-stone-900 min-h-screen text-stone-100 p-4">
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
            className="bg-orange-700/20 p-4 rounded-2xl shadow-md space-y-2"
          >
            <div className="flex items-center gap-2 text-orange-300">
              <CalendarDays size={18} />
              <span className="uppercase tracking-wider text-xs" suppressHydrationWarning>
                {formatDate(rand.date)}
              </span>
            </div>
            {getEntryPhotos(rand.items[0])[0] && (
              <img
                src={getEntryPhotos(rand.items[0])[0]}
                alt="Day photo"
                className="w-full h-48 object-cover rounded-lg"
              />
            )}
            <p className="line-clamp-3 text-sm opacity-90">
              {rand.items[0]?.note || "(no note)"}
            </p>
            <Button size="sm" onClick={() => openDrawer(rand)}>
              View full day
            </Button>
          </motion.div>
        )}

        {/* Calendar */}
        <section className="flex justify-center">
          <div className="relative bg-stone-800 rounded-lg p-4">

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
                    const g = byDate.find((d) => d.date === iso);

                    // If there's an entry, always open entry drawer (entries take priority)
                    if (g && g.items[0]) {
                      setEntryDate(iso);
                      setDay(g.items[0].day);
                      setEnergy(g.items[0].energy);
                      setTouch(g.items[0].touch);
                      setNote(g.items[0].note || "");
                      setPhotoUrls(getEntryPhotos(g.items[0]));
                      setAddOpen(true);
                      return;
                    }

                    // No entry - check if this day is part of a theme
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

                    // No entry and no theme - open new entry drawer
                    setEntryDate(iso);
                    setDay("Good day");
                    setEnergy("Energized");
                    setTouch("Touching");
                    setNote("");
                    setPhotoUrls([]);
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

        {/* Stats */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Days Logged" value={byDate.length} />
            <Card className="bg-stone-800">
              <CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center text-center">
                <p className="text-xs sm:text-sm font-bold opacity-60 mb-1">Mood Grade</p>
                {sentimentData ? (
                  <p className="text-4xl sm:text-5xl font-bold">{sentimentData.grade}</p>
                ) : (
                  <p className="text-4xl sm:text-5xl font-bold text-stone-500">–</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="bg-stone-800">
            <CardContent className="p-4 sm:p-6 text-center">
              <p className="text-xs sm:text-sm font-bold opacity-60 mb-2">Recent Vibe</p>
              {sentimentData ? (
                <div className="space-y-2">
                  <p className="text-sm sm:text-base leading-relaxed">{sentimentData.summary}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={analyzeSentiment}
                    disabled={analyzing}
                    className="p-0 h-auto text-orange-400 hover:text-orange-300 text-xs"
                  >
                    {analyzing ? (
                      <Loader2 className="animate-spin mr-1" size={12} />
                    ) : (
                      <RefreshCcw size={12} className="mr-1" />
                    )}
                    {analyzing ? "Analyzing..." : "Re-analyze"}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={analyzeSentiment}
                  disabled={analyzing}
                  className="p-0 h-auto text-orange-400 hover:text-orange-300"
                >
                  {analyzing ? (
                    <Loader2 className="animate-spin mr-1" size={14} />
                  ) : (
                    <Sparkles size={14} className="mr-1" />
                  )}
                  {analyzing ? "Analyzing..." : "Analyze"}
                </Button>
              )}
            </CardContent>
          </Card>
        </section>

        {/* New Entry Drawer */}
        <Drawer open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setShowDatePicker(false); }}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>New Entry</DrawerTitle>
            </DrawerHeader>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="space-y-2 relative">
                <label className="text-sm opacity-70">Date</label>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full rounded bg-stone-800 p-2 text-sm text-white text-left flex items-center justify-between"
                >
                  <span>{entryDate ? new Date(entryDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Select date"}</span>
                  <CalendarDays className="w-4 h-4 opacity-70" />
                </button>
                {showDatePicker && (
                  <div className="absolute z-50 mt-1 bg-stone-800 rounded-lg shadow-xl border border-stone-700">
                    <DayPicker
                      mode="single"
                      selected={entryDate ? new Date(entryDate + "T00:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setEntryDate(isoLocal(date));
                        }
                        setShowDatePicker(false);
                      }}
                      styles={{
                        head_cell: { color: "white" },
                        day: { borderRadius: "0.5rem" },
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Photo picker */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {photoUrls.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
                    {photoUrls.map((url, idx) => (
                      <div key={idx} className="relative flex-shrink-0 snap-center" style={{ width: 'calc(100% - 1rem)', maxWidth: '280px' }}>
                        <img
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-48 object-cover rounded-lg cursor-pointer"
                          onClick={() => setEnlargedPhoto(url)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Remove this photo?")) {
                              setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
                            }
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {photoUrls.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddPhoto}
                        disabled={photoLoading}
                        className="flex-shrink-0 w-32 h-48 rounded-lg border-2 border-dashed border-stone-600 flex flex-col items-center justify-center gap-2 text-stone-400 hover:border-stone-500 hover:text-stone-300 snap-center"
                      >
                        {photoLoading ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <ImagePlus className="w-6 h-6" />
                        )}
                        <span className="text-xs">{photoLoading ? "Uploading..." : "Add"}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddPhoto}
                    disabled={photoLoading}
                    className="flex items-center gap-2"
                  >
                    {photoLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                    {photoLoading ? "Uploading..." : "Add Photo"}
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm opacity-70">Note</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened today?"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-700">
                <div className="flex gap-1">
                  {(["Good day", "Bad day"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setDay(opt)}
                      className={`px-3 py-1 rounded-full text-xs ${
                        day === opt ? "bg-orange-700 text-white" : "bg-stone-700 text-stone-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-stone-600" />
                <div className="flex gap-1">
                  {(["Energized", "Tired"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEnergy(opt)}
                      className={`px-3 py-1 rounded-full text-xs ${
                        energy === opt ? "bg-orange-700 text-white" : "bg-stone-700 text-stone-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-stone-600" />
                <div className="flex gap-1">
                  {(["Touching", "No Touching"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTouch(opt)}
                      className={`px-3 py-1 rounded-full text-xs ${
                        touch === opt ? "bg-orange-700 text-white" : "bg-stone-700 text-stone-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DrawerFooter className="flex flex-col gap-2 shrink-0">
              <Button onClick={saveEntry} className="w-full">Save</Button>
              <Button variant="ghost" onClick={() => setAddOpen(false)} className="w-full">
                Cancel
              </Button>
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
                  <Card key={i} className="bg-stone-800">
                    <CardContent className="p-4 space-y-3 text-sm">
                      {getEntryPhotos(item).length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-2 px-2">
                          {getEntryPhotos(item).map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`Photo ${idx + 1}`}
                              className="flex-shrink-0 w-full max-h-[60vh] object-contain rounded-lg cursor-pointer snap-center"
                              style={{ minWidth: 'calc(100% - 0.5rem)' }}
                              onClick={() => setEnlargedPhoto(url)}
                            />
                          ))}
                        </div>
                      )}
                      {item.note && (
                        <p className="whitespace-pre-wrap text-base">{item.note}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs opacity-70 pt-2 border-t border-stone-700">
                        <span>{item.day}</span>
                        <span>{item.energy}</span>
                        <span>{item.touch}</span>
                      </div>
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
        className="fixed right-6 h-14 w-14 rounded-full p-0 bg-orange-700 hover:bg-orange-600"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Plus />
      </Button>

      {/* Celebration screen */}
      {showCelebration && (
        <Celebration
          onComplete={handleCelebrationComplete}
          dayType={savedDayType}
        />
      )}

      {/* Photo lightbox */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          onClick={() => setEnlargedPhoto(null)}
        >
          <button
            className="absolute right-4 text-white/70 hover:text-white z-10"
            style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
            onClick={() => setEnlargedPhoto(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={enlargedPhoto}
            alt="Enlarged photo"
            className="w-full h-full object-contain touch-pinch-zoom"
            style={{ touchAction: "pinch-zoom" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
                ? "bg-orange-700 text-white"
                : "bg-stone-700 text-stone-300"
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
    <Card className="bg-stone-800">
      <CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center text-center">
        <p className="text-xs sm:text-sm font-bold opacity-60 mb-1">{label}</p>
        <p className="text-4xl sm:text-5xl font-bold">{value}</p>
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
