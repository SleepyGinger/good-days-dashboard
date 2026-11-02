"use client";

import { useEffect, useState } from "react";
import type { Entry, GroupedEntry } from "../lib/domain";
import { subscribeEntries } from "../lib/dataService";

function groupEntries(raw: Record<string, Entry>): GroupedEntry[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of Object.values(raw)) {
    groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]);
  }
  return Array.from(groups, ([date, items]) => ({ date, items })).sort((a, b) => b.date.localeCompare(a.date));
}

export function useEntries(userId: string | null) {
  const [snapshot, setSnapshot] = useState<{ data: GroupedEntry[]; loading: boolean; error: Error | null }>({ data: [], loading: !!userId, error: null });
  useEffect(() => {
    if (!userId) { setSnapshot({ data: [], loading: false, error: null }); return; }
    setSnapshot({ data: [], loading: true, error: null });
    return subscribeEntries(
      (raw) => setSnapshot({ data: groupEntries(raw), loading: false, error: null }),
      (error) => setSnapshot((previous) => ({ ...previous, loading: false, error })),
    );
  }, [userId]);
  return snapshot;
}
