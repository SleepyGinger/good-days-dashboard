"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, RefreshCcw, Plus } from "lucide-react";
import { motion } from "framer-motion";

// ─── Firebase ────────────────────────────────────────────────────
import {
  initializeApp,
  type FirebaseApp,
} from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  off,
  push,
} from "firebase/database";

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

const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ─── Realtime data hook ──────────────────────────────────────────
const useGoodDaysData = () => {
  const [byDate, setByDate] = useState<
    { date: string; items: any[] }[]
  >([]);

  useEffect(() => {
    const r = ref(db, "moodData");
    const unsub = onValue(r, (snap) => {
      const raw = snap.val() ?? {};
      const arr: any[] = Object.values(raw);

      const grouped = new Map<string, any[]>();
      arr.forEach((item) => {
        const date = item.date ?? isoFromKey(item);
        if (!date) return;
        grouped.set(date, [...(grouped.get(date) ?? []), item]);
      });

      const sorted = Array.from(grouped.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, items]) => ({ date, items }));

      setByDate(sorted);
    });

    return () => off(r, "value", unsub);
  }, []);

  return { byDate };
};

// ─── Main component ─────────────────────────────────────────────
export default function GoodDaysDashboard() {
  // dark mode default
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { byDate } = useGoodDaysData();

  // Drawer states
  const [addOpen, setAddOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<any | null>(null);

  // Random‑day banner
  const [rand, setRand] = useState<any | null>(null);
  useEffect(() => {
    if (!byDate.length) return;
    setRand(byDate[Math.floor(Math.random() * byDate.length)]);
  }, [byDate]);

  // New‑entry form state
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [entryNote, setEntryNote] = useState("");

  // handlers
  const openDrawer = (data: any) => {
    setDrawerData(data);
    setViewOpen(true);
  };

  const saveEntry = async () => {
    if (!entryNote.trim()) return;

    const newItem = {
      date: entryDate,
      note: entryNote.trim(),
    };

    await push(ref(db, "moodData"), newItem);

    // reset + close
    setEntryNote("");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setAddOpen(false);
  };

  return (
    <div className="dark bg-gray-900 min-h-screen text-gray-100 p-4 space-y-6">
      {/* ── Header ───────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Good Days</h1>
        {byDate.length > 0 && (
          <Button
            variant="ghost"
            onClick={() =>
              setRand(
                byDate[Math.floor(Math.random() * byDate.length)]
              )
            }
            className="flex gap-2"
          >
            <RefreshCcw size={16} /> Random Day
          </Button>
        )}
      </header>

      {/* ── Random Day Banner ────────────────────────── */}
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
            {rand.items[0]?.note ?? "(no notes)"}
          </p>
          <Button size="sm" onClick={() => openDrawer(rand)}>
            View full day
          </Button>
        </motion.div>
      )}

      {/* ── Stats ────────────────────────────────────── */}
      <section className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Days Logged" value={byDate.length} />
        <StatCard
          label="Entries"
          value={byDate.reduce(
            (a, d) => a + d.items.length,
            0
          )}
        />
        <StatCard label="% Good Days" value={goodDayRate(byDate)} />
      </section>

      {/* ── Timeline ─────────────────────────────────── */}
      <section className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {byDate.map((d) => (
          <Card
            key={d.date}
            className="bg-gray-800 hover:bg-gray-700 transition cursor-pointer"
            onClick={() => openDrawer(d)}
          >
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <h2 className="font-medium">
                  {formatDate(d.date, false)}
                </h2>
                <p className="text-xs opacity-70 line-clamp-1 max-w-xs">
                  {d.items[0]?.note ?? "(empty)"}
                </p>
              </div>
              <span className="text-sm opacity-60">
                {d.items.length} items
              </span>
            </CardContent>
          </Card>
        ))}

        {byDate.length === 0 && (
          <p className="text-center text-sm opacity-60 pt-10">
            No data yet. Start logging!
          </p>
        )}
      </section>

      {/* ── Add Entry Drawer ─────────────────────────── */}
      <Drawer open={addOpen} onOpenChange={setAddOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New Entry</DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm opacity-70">Date</label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm opacity-70">Note</label>
              <Textarea
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="What happened today?"
              />
            </div>
          </div>

          <DrawerFooter className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveEntry}>Save</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── View Notes Drawer ────────────────────────── */}
      <Drawer open={viewOpen} onOpenChange={setViewOpen}>
        {drawerData && (
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>
                {formatDate(drawerData.date)}
              </DrawerTitle>
            </DrawerHeader>

            <div className="p-6 space-y-4">
              {drawerData.items.map((item: any, idx: number) => (
                <Card key={idx} className="bg-gray-800">
                  <CardContent className="p-4 space-y-1">
                    <p className="text-sm opacity-90">
                      {item.note || "(no note)"}
                    </p>
                    <div className="text-xs opacity-60 flex gap-4 pt-1">
                      {item.day && <span>Day: {item.day}</span>}
                      {item.touch && (
                        <span>Touch: {item.touch}</span>
                      )}
                      {item.energy && (
                        <span>Energy: {item.energy}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DrawerContent>
        )}
      </Drawer>

      {/* ── Floating “+” button ──────────────────────── */}
      <Button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full p-0 bg-indigo-600 hover:bg-indigo-500"
      >
        <Plus />
      </Button>
    </div>
  );
}

// ─── Helper Components & utils ─────────────────────────
function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="bg-gray-800">
      <CardContent className="p-4 space-y-1">
        <p className="text-xs opacity-60">{label}</p>
        <p className="text-xl font-bold">{value ?? "–"}</p>
      </CardContent>
    </Card>
  );
}

function formatDate(dateIso: string, withYear = true): string {
  const opts = withYear
    ? {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    : {
        weekday: "short",
        month: "short",
        day: "numeric",
      };
  return new Date(dateIso).toLocaleDateString(undefined, opts);
}

function goodDayRate(
  data: { date: string; items: any[] }[]
): string {
  if (!data.length) return "–";
  const total = data.length;
  const good = data.filter((d) =>
    d.items.some((i) => i.day === "Good day")
  ).length;
  return ((good / total) * 100).toFixed(0) + "%";
}

function isoFromKey(item: any): string | null {
  // expects keys like YYYYMMDD when date field missing
  const key = Object.keys(item).find((k) => /^\d{8}$/.test(k));
  return key
    ? `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`
    : null;
}