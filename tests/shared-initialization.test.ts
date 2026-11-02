import test from "node:test";
import assert from "node:assert/strict";
import { sharedInitialization } from "../src/lib/sharedInitialization.ts";

test("concurrent mounts await the same completed initialization", async () => {
  let initialized = false;
  let calls = 0;
  let finish!: () => void;
  const initialize = sharedInitialization(async () => {
    calls += 1;
    await new Promise<void>((resolve) => { finish = resolve; });
    initialized = true;
    return "ready";
  });
  const first = initialize();
  const second = initialize();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(initialized, false);
  finish();
  assert.deepEqual(await Promise.all([first, second]), ["ready", "ready"]);
  assert.equal(initialize(), first);
});

test("failed initialization permits retry", async () => {
  let calls = 0;
  const initialize = sharedInitialization(async () => {
    calls += 1;
    if (calls === 1) throw new Error("module unavailable");
    return "ready";
  });
  await assert.rejects(initialize(), /module unavailable/);
  assert.equal(await initialize(), "ready");
  assert.equal(calls, 2);
});
