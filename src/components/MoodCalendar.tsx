"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isoLocal, isoToLocalDate, themeCoversDate } from "@/lib/dates";
import type { Entry, GroupedEntry, Theme } from "@/lib/domain";

interface Props {
  entries: GroupedEntry[];
  themes: Theme[];
  onEntry: (date: string, entry?: Entry) => void;
  onTheme: (theme: Theme) => void;
}

export default function MoodCalendar({ entries, themes, onEntry, onTheme }: Props) {
  const [month, setMonth] = useState(() => new Date());
  return (
    <section className="flex justify-center">
      <div className="relative bg-stone-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft /></Button>
          <p className="font-medium">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
          <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight /></Button>
        </div>
        <DayPicker className="mx-auto" month={month}
          modifiers={{ hasData: entries.map((group) => isoToLocalDate(group.date)), hasTheme: (date) => themes.some((theme) => themeCoversDate(theme, isoLocal(date))) }}
          modifiersClassNames={{ hasData: "bg-orange-700 text-white", hasTheme: "ring-2 ring-lime-700 ring-inset" }}
          classNames={{ nav: "hidden", month_caption: "hidden" }} styles={{ day: { borderRadius: "0.5rem" } }}
          onDayClick={(date) => {
            const iso = isoLocal(date);
            const entry = entries.find((group) => group.date === iso)?.items[0];
            if (entry) { onEntry(iso, entry); return; }
            const theme = themes.find((item) => themeCoversDate(item, iso));
            if (theme) onTheme(theme);
            else onEntry(iso);
          }} />
        {entries.length === 0 && <p className="text-center text-sm opacity-60 pt-4">No data yet. Start logging!</p>}
      </div>
    </section>
  );
}
