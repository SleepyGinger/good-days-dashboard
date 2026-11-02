export interface SentimentNote {
  date: string;
  note: string;
}

export interface SentimentResult {
  grade: string;
  summary: string;
}

export const SENTIMENT_LIMITS = {
  notes: 64,
  noteCharacters: 8_000,
  totalCharacters: 60_000,
  bodyBytes: 256_000,
  summaryCharacters: 2_000,
} as const;

const GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSentimentNotes(value: unknown): SentimentNote[] {
  if (!isRecord(value) || !Array.isArray(value.notes) || value.notes.length === 0) {
    throw new Error("Provide at least one journal note.");
  }
  if (value.notes.length > SENTIMENT_LIMITS.notes) {
    throw new Error(`Analyze at most ${SENTIMENT_LIMITS.notes} notes at a time.`);
  }

  let totalCharacters = 0;
  return value.notes.map((item: unknown) => {
    if (!isRecord(item) || typeof item.date !== "string" || typeof item.note !== "string") {
      throw new Error("Each note needs a date and text.");
    }
    const parsedDate = new Date(`${item.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== item.date) {
      throw new Error("Each note needs a valid YYYY-MM-DD date.");
    }
    const note = item.note.trim();
    totalCharacters += note.length;
    if (!note || note.length > SENTIMENT_LIMITS.noteCharacters || totalCharacters > SENTIMENT_LIMITS.totalCharacters) {
      throw new Error("Journal notes are empty or exceed the analysis size limit.");
    }
    return { date: item.date, note };
  });
}

export function parseSentimentResult(value: unknown): SentimentResult {
  if (!isRecord(value) || typeof value.grade !== "string" || !GRADES.has(value.grade) ||
      typeof value.summary !== "string" || !value.summary.trim() ||
      value.summary.length > SENTIMENT_LIMITS.summaryCharacters) {
    throw new Error("The analysis response was invalid. Please try again.");
  }
  return { grade: value.grade, summary: value.summary.trim() };
}
