/* eslint-disable @next/next/no-img-element -- Firebase photos are compressed before upload and served directly. */
"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, Plus, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EntryEditor from "@/components/EntryEditor";
import EntryViewer from "@/components/EntryViewer";
import MoodCalendar from "@/components/MoodCalendar";
import SentimentSummary from "@/components/SentimentSummary";
import PhotoLightbox from "@/components/photos/PhotoLightbox";
import ThemeDrawer from "@/components/ThemeDrawer";
import Celebration from "@/components/Celebration";
import { useAuth, isNativePlatform, type AuthUser } from "@/lib/authService";
import { useEntries } from "@/hooks/useEntries";
import { useThemes } from "@/hooks/useThemes";
import { saveTheme, deleteTheme } from "@/lib/dataService";
import { formatDate, isoLocal } from "@/lib/dates";
import { getEntryPhotos, type Entry, type GroupedEntry, type Theme } from "@/lib/domain";
import "react-day-picker/dist/style.css";

function SignIn({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <div className="dark bg-stone-900 min-h-screen text-stone-100 p-6 flex items-center justify-center">
    <div className="w-full max-w-sm text-center space-y-4">
      <h1 className="text-2xl font-semibold">Good Days</h1>
      <p className="text-stone-400">Please sign in to continue</p>
      {auth.error && <p role="alert" className="text-sm text-red-300">{auth.error.message}</p>}
      {isNativePlatform() ? <form className="space-y-3 text-left" onSubmit={async (event) => {
        event.preventDefault();
        await auth.signInWithPassword(email, password);
        setPassword("");
      }}>
        <label htmlFor="sign-in-email" className="text-sm">Email</label>
        <Input id="sign-in-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="sign-in-password" className="text-sm">Password</label>
        <Input id="sign-in-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button type="submit" className="w-full bg-orange-700 hover:bg-orange-600">Sign in</Button>
      </form> : <Button onClick={() => void auth.signInWithGoogle()} className="bg-orange-700 hover:bg-orange-600">Sign in with Google</Button>}
    </div>
  </div>;
}

export default function GoodDaysDashboard() {
  const auth = useAuth();
  useEffect(() => document.documentElement.classList.add("dark"), []);
  if (auth.loading) return <div className="dark bg-stone-900 min-h-screen text-stone-100 p-4 flex items-center justify-center"><p>Loading…</p></div>;
  if (!auth.user) return <SignIn auth={auth} />;
  return <Dashboard key={auth.user.uid} user={auth.user} logout={auth.logout} authError={auth.error} />;
}

function Dashboard({ user, logout, authError }: { user: AuthUser; logout: () => Promise<void>; authError: Error | null }) {
  const entries = useEntries(user.uid);
  const themes = useThemes(user.uid);
  const [randomDate, setRandomDate] = useState<string | null>(null);
  const randomInitialized = useRef(false);
  const [editor, setEditor] = useState<{ id: number; date: string; entry?: Entry } | null>(null);
  const draftSequence = useRef(0);
  const [viewer, setViewer] = useState<GroupedEntry | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [savedDay, setSavedDay] = useState<Entry["day"] | null>(null);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (entries.data.length && !randomInitialized.current) {
      randomInitialized.current = true;
      setRandomDate(entries.data[Math.floor(Math.random() * entries.data.length)].date);
    }
  }, [entries.data]);

  const openEntry = (date: string, entry?: Entry) => {
    setEditor({ id: ++draftSequence.current, date, entry });
  };
  const random = entries.data.find((group) => group.date === randomDate);
  const error = authError || entries.error || themes.error;

  return <div className="dark bg-stone-900 min-h-screen text-stone-100 p-4">
    <main className="mx-auto max-w-screen-sm flex flex-col gap-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold whitespace-nowrap shrink-0">Good Days</h1>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" onClick={() => void logout()}>Sign Out</Button>
          <Button variant="ghost" onClick={() => { setEditingTheme(null); setThemeOpen(true); }} className="flex gap-2"><CalendarPlus size={16} /> Themes</Button>
          {entries.data.length > 0 && <Button variant="ghost" onClick={() => setRandomDate(entries.data[Math.floor(Math.random() * entries.data.length)].date)} className="flex gap-2"><RefreshCcw size={16} /> Random Day</Button>}
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-red-300">{error.message} Your last loaded entries are still shown.</p>}
      {entries.loading ? <p className="text-sm text-stone-400">Loading your days…</p> : <>
        {random && <motion.div layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-orange-700/20 p-4 rounded-2xl shadow-md space-y-2">
          <div className="flex items-center gap-2 text-orange-300"><CalendarDays size={18} /><span className="uppercase tracking-wider text-xs">{formatDate(random.date)}</span></div>
          {getEntryPhotos(random.items[0])[0] && <img src={getEntryPhotos(random.items[0])[0]} alt="Day photo" className="w-full h-48 object-cover rounded-lg cursor-pointer" onClick={() => setEnlargedPhoto(getEntryPhotos(random.items[0])[0])} />}
          <p className="line-clamp-3 text-sm opacity-90">{random.items[0]?.note || "(no note)"}</p>
          <Button size="sm" onClick={() => setViewer(random)}>View full day</Button>
        </motion.div>}
        <MoodCalendar entries={entries.data} themes={themes.data} onEntry={openEntry} onTheme={(theme) => { setEditingTheme(theme); setThemeOpen(true); }} />
        <SentimentSummary entries={entries.data} userId={user.uid} />
      </>}
      <ThemeDrawer open={themeOpen} onOpenChange={(open) => { setThemeOpen(open); if (!open) setEditingTheme(null); }} initial={editingTheme}
        onSave={saveTheme} onDelete={editingTheme?.id ? deleteTheme : undefined} userId={user.uid} />
    </main>
    <Button aria-label="New entry" onClick={() => openEntry(isoLocal(), entries.data.find((group) => group.date === isoLocal())?.items[0])} className="fixed right-6 h-14 w-14 rounded-full p-0 bg-orange-700 hover:bg-orange-600" style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}><Plus /></Button>
    {editor && <EntryEditor key={editor.id} date={editor.date} initial={editor.entry} userId={user.uid} existingDates={entries.data.map((group) => group.date)} onClose={() => setEditor(null)} onSaved={(entry) => { setEditor(null); setSavedDay(entry.day); }} />}
    {viewer && <EntryViewer entry={viewer} onClose={() => setViewer(null)} onPhoto={setEnlargedPhoto} />}
    {savedDay && <Celebration dayType={savedDay} onComplete={() => setSavedDay(null)} />}
    {enlargedPhoto && <PhotoLightbox src={enlargedPhoto} onClose={() => setEnlargedPhoto(null)} />}
  </div>;
}
