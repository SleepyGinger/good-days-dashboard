interface PollingOptions<T> {
  read(): Promise<T>;
  onData(data: T): void;
  onError(error: Error): void;
  subscribeToChanges?(refresh: () => void): () => void;
  schedule?(refresh: () => void): () => void;
}

/** Poll without overlapping requests or publishing results after cleanup. */
export function subscribeByPolling<T>({ read, onData, onError, subscribeToChanges, schedule }: PollingOptions<T>) {
  let active = true;
  let inFlight = false;
  let refreshPending = false;
  const poll = async () => {
    if (!active) return;
    if (inFlight) { refreshPending = true; return; }
    inFlight = true;
    try {
      const data = await read();
      if (active) onData(data);
    } catch (error) {
      if (active) onError(error instanceof Error ? error : new Error("Unable to load the journal."));
    } finally {
      inFlight = false;
      if (active && refreshPending) { refreshPending = false; void poll(); }
    }
  };
  const refresh = () => { void poll(); };
  const stopSchedule = schedule ? schedule(refresh) : (() => {
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  })();
  const stopChanges = subscribeToChanges?.(refresh);
  refresh();
  return () => { active = false; stopSchedule(); stopChanges?.(); };
}
