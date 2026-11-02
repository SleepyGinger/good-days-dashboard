"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadSentiment, saveSentiment } from "@/lib/dataService";
import { analyzeRecentSentiment } from "@/lib/sentiment-client";
import { isoLocal } from "@/lib/dates";
import type { GroupedEntry, SentimentData } from "@/lib/domain";

export default function SentimentSummary({ entries, userId }: { entries: GroupedEntry[]; userId: string }) {
  const [data, setData] = useState<SentimentData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef({ generation: 0, active: true });
  const analysisLock = useRef(false);

  useEffect(() => {
    const state = lifecycle.current;
    state.active = true;
    const current = ++state.generation;
    setData(null);
    loadSentiment("last60", userId).then((saved) => { if (state.active && current === state.generation) setData(saved); }).catch(() => {
      if (state.active && current === state.generation) setError("Your saved analysis couldn’t be loaded. Try again shortly.");
    });
    return () => { state.active = false; state.generation++; };
  }, [userId]);

  const analyze = async () => {
    if (analysisLock.current) return;
    setError(null);
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const notes = entries.filter((group) => group.date >= isoLocal(since) && group.date <= isoLocal() && group.items[0]?.note.trim())
      .map((group) => ({ date: group.date, note: group.items[0].note }));
    if (!notes.length) { setError("No notes found in the last 60 days to analyze."); return; }
    analysisLock.current = true;
    const state = lifecycle.current;
    const current = ++state.generation;
    setAnalyzing(true);
    try {
      const result = await analyzeRecentSentiment(notes, userId);
      if (!state.active || current !== state.generation) return;
      await saveSentiment("last60", result, userId);
      if (state.active && current === state.generation) setData(result);
    } catch (cause) {
      if (state.active && current === state.generation) setError(cause instanceof Error ? cause.message : "Couldn’t analyze your notes. Try again.");
    } finally {
      analysisLock.current = false;
      if (state.active && current === state.generation) setAnalyzing(false);
    }
  };

  return <section className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <Card className="bg-stone-800"><CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center text-center">
        <p className="text-xs sm:text-sm font-bold opacity-60 mb-1">Days Logged</p><p className="text-4xl sm:text-5xl font-bold">{entries.length}</p>
      </CardContent></Card>
      <Card className="bg-stone-800"><CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center text-center">
        <p className="text-xs sm:text-sm font-bold opacity-60 mb-1">Mood Grade</p><p className={`text-4xl sm:text-5xl font-bold ${data ? "" : "text-stone-500"}`}>{data?.grade ?? "–"}</p>
      </CardContent></Card>
    </div>
    <Card className="bg-stone-800"><CardContent className="p-4 sm:p-6 text-center">
      <p className="text-xs sm:text-sm font-bold opacity-60 mb-2">Recent Vibe</p>
      {data && <p className="text-sm sm:text-base leading-relaxed mb-2">{data.summary}</p>}
      <Button size="sm" variant="ghost" onClick={analyze} disabled={analyzing} className="p-0 h-auto text-orange-400 hover:text-orange-300">
        {analyzing ? <Loader2 className="animate-spin mr-1" size={14} /> : data ? <RefreshCcw className="mr-1" size={14} /> : <Sparkles className="mr-1" size={14} />}
        {analyzing ? "Analyzing…" : data ? "Re-analyze" : "Analyze recent notes"}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </CardContent></Card>
  </section>;
}
