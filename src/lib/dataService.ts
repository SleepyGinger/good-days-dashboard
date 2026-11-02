import type { Entry, Theme, SentimentData } from "./domain";
import { getFirebaseClient, firebaseConfig } from "./firebaseClient";
import { getIdToken, isNativePlatform } from "./authService";
import { isoToKey } from "./dates";
import { decodeEntries, decodeThemes, decodeSentiment } from "./dataRecords";
import { subscribeByPolling } from "./dataSubscriptions";
import { createCloudDataClient } from "./cloudDataClient";

type Collection = "moodData" | "themes" | "sentimentData";
const changes = new Map<Collection, Set<() => void>>();
const notify = (collection: Collection) => changes.get(collection)?.forEach((refresh) => refresh());
const observeChanges = (collection: Collection, refresh: () => void) => {
  if (!changes.has(collection)) changes.set(collection, new Set());
  changes.get(collection)!.add(refresh);
  return () => { changes.get(collection)?.delete(refresh); };
};

function validKey(key: string): string {
  if (!key || /[.#$\[\]/]/.test(key)) throw new Error("The journal record key is invalid.");
  return key;
}

function requireSignedInCaller(userId: string | null | undefined) {
  if (userId === null) throw new Error("Please sign in to continue.");
}

const restRequest = createCloudDataClient({
  databaseURL: firebaseConfig.databaseURL,
  getToken: getIdToken,
  onMutation: (path) => {
    const collection = path.split("/")[0];
    if (collection === "moodData" || collection === "themes" || collection === "sentimentData") notify(collection);
  },
});

function subscribeCollection<T>(collection: Collection, decode: (raw: unknown) => T, onData: (data: T) => void, onError: (error: Error) => void) {
  if (isNativePlatform()) {
    return subscribeByPolling({
      read: async () => decode(await restRequest(collection)),
      onData,
      onError,
      subscribeToChanges: (refresh) => observeChanges(collection, refresh),
    });
  }
  let active = true;
  let unsubscribe: (() => void) | null = null;
  void (async () => {
    await getIdToken();
    const { database } = await getFirebaseClient();
    const { ref, onValue } = await import("firebase/database");
    if (!active) return;
    unsubscribe = onValue(ref(database, collection), (snapshot) => {
      if (!active) return;
      try { onData(decode(snapshot.val() as unknown)); }
      catch (error) { onError(error instanceof Error ? error : new Error("Unable to read the journal.")); }
    }, (error) => { if (active) onError(error); });
  })().catch((error: unknown) => {
    if (active) onError(error instanceof Error ? error : new Error("Unable to load the journal."));
  });
  return () => { active = false; unsubscribe?.(); };
}

export function subscribeEntries(onData: (data: Record<string, Entry>) => void, onError: (error: Error) => void) {
  return subscribeCollection("moodData", decodeEntries, onData, onError);
}

export function subscribeThemes(onData: (data: Theme[]) => void, onError: (error: Error) => void) {
  return subscribeCollection("themes", decodeThemes, onData, onError);
}

// Paths deliberately remain shared household records, rather than per-user paths.
export async function upsertEntry(entry: Entry, userId?: string | null): Promise<void> {
  requireSignedInCaller(userId);
  const key = isoToKey(entry.date);
  decodeEntries({ [key]: entry });
  await restRequest(`moodData/${key}`, "PUT", entry, userId ?? undefined);
}

export async function saveTheme(theme: Theme, userId?: string | null): Promise<void> {
  requireSignedInCaller(userId);
  const data = { title: theme.title.trim(), start: theme.start, end: theme.end ?? null, color: theme.color || "#93c5fd" };
  decodeThemes({ draft: data });
  if (!theme.id) throw new Error("A new theme needs a stable draft ID before saving. Please reopen the theme drawer.");
  await restRequest(`themes/${validKey(theme.id)}`, "PUT", data, userId ?? undefined);
}

export async function deleteTheme(id: string, userId?: string | null): Promise<void> {
  requireSignedInCaller(userId);
  const path = `themes/${validKey(id)}`;
  await restRequest(path, "DELETE", undefined, userId ?? undefined);
}

export async function saveSentiment(key: string, data: SentimentData, userId?: string): Promise<void> {
  decodeSentiment(data);
  await restRequest(`sentimentData/${validKey(key)}`, "PUT", data, userId);
}

export async function loadSentiment(key: string, userId?: string): Promise<SentimentData | null> {
  const path = `sentimentData/${validKey(key)}`;
  return decodeSentiment(await restRequest(path, "GET", undefined, userId));
}
