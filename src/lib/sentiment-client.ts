import type { SentimentData } from "./domain";
import {
  parseSentimentNotes,
  parseSentimentResult,
  type SentimentNote,
} from "../../vercel-api/lib/sentiment-contract";

export type { SentimentNote } from "../../vercel-api/lib/sentiment-contract";

interface SentimentClientOptions {
  endpoint: string;
  getToken: () => Promise<string>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function secureEndpoint(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error("Mood analysis requires a valid HTTPS endpoint."); }
  const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  const localDevelopment = process.env.NODE_ENV === "development" && url.protocol === "http:" && loopback;
  if (url.username || url.password || (url.protocol !== "https:" && !localDevelopment)) {
    throw new Error("Mood analysis requires HTTPS without credentials in its URL.");
  }
  return url.href;
}

export function createSentimentClient({
  endpoint,
  getToken,
  fetcher = fetch,
  timeoutMs = 30_000,
}: SentimentClientOptions) {
  return async (input: SentimentNote[]): Promise<SentimentData> => {
    const notes = parseSentimentNotes({ notes: input });
    if (!endpoint) throw new Error("Mood analysis has not been configured.");
    const url = secureEndpoint(endpoint);
    const token = await getToken();
    if (!token) throw new Error("Sign in again before analyzing your notes.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      if (response.status === 401) throw new Error("Your sign-in expired. Sign in again and retry.");
      if (response.status === 403) throw new Error("This account cannot use mood analysis.");
      if (response.status === 429) throw new Error("Too many analysis requests. Please try again later.");
      if (!response.ok) throw new Error("Mood analysis is unavailable. Please try again later.");
      return parseSentimentResult(await response.json());
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Mood analysis timed out. Please try again.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export async function analyzeRecentSentiment(notes: SentimentNote[], expectedUid?: string): Promise<SentimentData> {
  const { getIdToken } = await import("./authService");
  return createSentimentClient({
    endpoint: process.env.NEXT_PUBLIC_SENTIMENT_API_URL || "",
    getToken: () => getIdToken(expectedUid),
  })(notes);
}
