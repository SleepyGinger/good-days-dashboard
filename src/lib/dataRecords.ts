import type { Entry, Theme, SentimentData } from "./domain";
import { isoToLocalDate } from "./dates";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { isoToLocalDate(value); return true; } catch { return false; }
}

function records(raw: unknown): Record<string, unknown> {
  if (raw === null) return {};
  if (!isRecord(raw)) throw new Error("The saved journal has an invalid format.");
  return raw;
}

export function decodeEntries(raw: unknown): Record<string, Entry> {
  const result: Record<string, Entry> = {};
  for (const [key, value] of Object.entries(records(raw))) {
    if (!isRecord(value) || !validDate(value.date)
      || (value.day !== "Good day" && value.day !== "Bad day")
      || (value.energy !== "Energized" && value.energy !== "Tired")
      || (value.touch !== "Touching" && value.touch !== "No Touching")
      || typeof value.note !== "string"
      || (value.photoUrl !== undefined && typeof value.photoUrl !== "string")
      || (value.photoUrls !== undefined && (!Array.isArray(value.photoUrls) || !value.photoUrls.every((url: unknown) => typeof url === "string")))) {
      throw new Error("A saved entry has an invalid format. Your data has not been changed.");
    }
    result[key] = value as unknown as Entry;
  }
  return result;
}

export function decodeThemes(raw: unknown): Theme[] {
  return Object.entries(records(raw)).map(([id, value]) => {
    if (!isRecord(value) || typeof value.title !== "string" || !value.title.trim()
      || !validDate(value.start)
      || (value.end !== undefined && value.end !== null && (!validDate(value.end) || value.end < value.start))
      || (value.color !== undefined && typeof value.color !== "string")) {
      throw new Error("A saved theme has an invalid format. Your data has not been changed.");
    }
    return { ...value, id } as unknown as Theme;
  });
}

export function decodeSentiment(raw: unknown): SentimentData | null {
  if (raw === null) return null;
  if (!isRecord(raw) || typeof raw.grade !== "string" || typeof raw.summary !== "string") {
    throw new Error("The saved mood analysis has an invalid format.");
  }
  return { grade: raw.grade, summary: raw.summary };
}
