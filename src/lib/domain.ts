export interface Entry {
  date: string;
  day: "Good day" | "Bad day";
  energy: "Energized" | "Tired";
  touch: "Touching" | "No Touching";
  note: string;
  photoUrl?: string;
  photoUrls?: string[];
}

export interface GroupedEntry {
  date: string;
  items: Entry[];
}

export interface Theme {
  id?: string;
  title: string;
  start: string;
  end?: string | null;
  color?: string;
}

export interface SentimentData {
  grade: string;
  summary: string;
}

export function getEntryPhotos(entry: Entry): string[] {
  if (entry.photoUrls?.length) return entry.photoUrls;
  return entry.photoUrl ? [entry.photoUrl] : [];
}
