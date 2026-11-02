import assert from "node:assert/strict";
import test from "node:test";
import { assertEntryDestination } from "../src/lib/entryDraft.ts";

test("a new or moved draft cannot overwrite a different saved day", () => {
  assert.throws(() => assertEntryDestination("2026-11-01", undefined, ["2026-11-01"]), /already an entry/);
  assert.throws(() => assertEntryDestination("2026-11-01", "2026-10-31", ["2026-11-01"]), /already an entry/);
  assert.doesNotThrow(() => assertEntryDestination("2026-11-01", "2026-11-01", ["2026-11-01"]));
  assert.doesNotThrow(() => assertEntryDestination("2026-11-02", undefined, ["2026-11-01"]));
});
