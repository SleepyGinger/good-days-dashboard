"use client";

import { useEffect, useState } from "react";
import type { Theme } from "../lib/domain";
import { subscribeThemes } from "../lib/dataService";

export function useThemes(userId: string | null) {
  const [snapshot, setSnapshot] = useState<{ data: Theme[]; loading: boolean; error: Error | null }>({ data: [], loading: !!userId, error: null });
  useEffect(() => {
    if (!userId) { setSnapshot({ data: [], loading: false, error: null }); return; }
    setSnapshot({ data: [], loading: true, error: null });
    return subscribeThemes(
      (data) => setSnapshot({ data, loading: false, error: null }),
      (error) => setSnapshot((previous) => ({ ...previous, loading: false, error })),
    );
  }, [userId]);
  return snapshot;
}
