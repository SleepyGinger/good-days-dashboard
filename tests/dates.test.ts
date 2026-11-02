import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, isoLocal, isoToKey, isoToLocalDate, themeCoversDate } from "../src/lib/dates.ts";
import { getEntryPhotos, type Entry } from "../src/lib/domain.ts";

process.env.TZ = "America/Los_Angeles";

test("opening and saving a journal date preserves its local calendar day", () => {
  for (const day of ["2026-11-01", "2026-03-08", "2024-02-29", "2026-12-31"]) {
    assert.equal(isoLocal(isoToLocalDate(day)), day);
  }
  assert.match(formatDate("2026-11-01"), /Nov 1, 2026/);
  assert.equal(isoToKey("2026-11-01"), "20261101");
});

test("invalid dates cannot silently roll forward into another journal day", () => {
  for (const invalid of ["2026-02-29", "2026-04-31", "2026-13-01", "", "2026-11-01T00:00:00Z"]) {
    assert.throws(() => isoToLocalDate(invalid), /valid date/);
  }
});

test("an open-ended theme covers later dates and bounded themes include both endpoints", () => {
  assert.equal(themeCoversDate({ start: "2026-10-01" }, "2026-11-01"), true);
  assert.equal(themeCoversDate({ start: "2026-10-01" }, "2026-09-30"), false);
  const theme = { start: "2026-10-01", end: "2026-10-03" };
  assert.equal(themeCoversDate(theme, theme.start), true);
  assert.equal(themeCoversDate(theme, theme.end), true);
  assert.equal(themeCoversDate(theme, "2026-10-04"), false);
});

test("legacy single-photo entries remain readable alongside multiple-photo entries", () => {
  const entry: Entry = { date: "2026-11-01", day: "Good day", energy: "Energized", touch: "Touching", note: "", photoUrl: "legacy.jpg" };
  assert.deepEqual(getEntryPhotos(entry), ["legacy.jpg"]);
  assert.deepEqual(getEntryPhotos({ ...entry, photoUrls: ["new.jpg"] }), ["new.jpg"]);
  assert.deepEqual(getEntryPhotos({ ...entry, photoUrls: [] }), ["legacy.jpg"]);
});
