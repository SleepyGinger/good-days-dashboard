import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntries, decodeThemes, decodeSentiment } from "../src/lib/dataRecords.ts";

test("legacy single-photo and new multi-photo entries remain readable", () => {
  const common = { date: "2026-11-01", day: "Good day", energy: "Energized", touch: "Touching", note: "Journal note" };
  assert.equal(decodeEntries({ old: { ...common, photoUrl: "https://example.com/old.jpg" } }).old.photoUrl, "https://example.com/old.jpg");
  assert.deepEqual(decodeEntries({ current: { ...common, photoUrls: ["https://example.com/new.jpg"] } }).current.photoUrls, ["https://example.com/new.jpg"]);
  assert.deepEqual(decodeEntries(null), {});
});

test("malformed snapshots surface an error instead of being mistaken for an empty journal", () => {
  assert.throws(() => decodeEntries([]), /invalid format/);
  assert.throws(() => decodeEntries({ invalid: { date: "2026-02-30" } }), /invalid format/);
  assert.throws(() => decodeSentiment({ grade: "A", summary: {} }), /invalid format/);
});

test("themes preserve open ends and use the database key as the stable ID", () => {
  assert.deepEqual(decodeThemes({ "real-key": { id: "stale-id", title: "Family time", start: "2026-11-01", end: null } }), [
    { id: "real-key", title: "Family time", start: "2026-11-01", end: null },
  ]);
  assert.throws(() => decodeThemes({ bad: { title: "Reversed", start: "2026-11-02", end: "2026-11-01" } }), /invalid format/);
});
