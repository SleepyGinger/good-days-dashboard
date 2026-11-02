import test from "node:test";
import assert from "node:assert/strict";
import { subscribeByPolling } from "../src/lib/dataSubscriptions.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("polling keeps the last journal data when a later read fails", async () => {
  let refresh!: () => void;
  let reads = 0;
  const received: string[][] = [];
  const errors: Error[] = [];
  let stopped = false;
  const unsubscribe = subscribeByPolling({
    read: async () => { reads += 1; if (reads > 1) throw new Error("offline"); return ["saved-entry"]; },
    onData: (data) => received.push(data), onError: (error) => errors.push(error),
    schedule: (callback) => { refresh = callback; return () => { stopped = true; }; },
  });
  await tick();
  refresh();
  await tick();
  assert.deepEqual(received, [["saved-entry"]]);
  assert.equal(errors[0]?.message, "offline");
  unsubscribe();
  assert.equal(stopped, true);
});

test("subscription cleanup suppresses an in-flight response and removes change listeners", async () => {
  let resolve!: (value: string[]) => void;
  let stopped = false;
  let changesStopped = false;
  const received: string[][] = [];
  const unsubscribe = subscribeByPolling({
    read: () => new Promise<string[]>((accept) => { resolve = accept; }),
    onData: (data) => received.push(data), onError: assert.fail,
    schedule: () => () => { stopped = true; },
    subscribeToChanges: () => () => { changesStopped = true; },
  });
  unsubscribe();
  resolve(["late-entry"]);
  await tick();
  assert.deepEqual(received, []);
  assert.equal(stopped, true);
  assert.equal(changesStopped, true);
});

test("save notifications refresh immediately and overlapping refreshes are serialized", async () => {
  let changed!: () => void;
  let finish!: (value: number) => void;
  let reads = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const received: number[] = [];
  const unsubscribe = subscribeByPolling({
    read: async () => {
      reads += 1; concurrent += 1; maxConcurrent = Math.max(maxConcurrent, concurrent);
      try { return await new Promise<number>((resolve) => { finish = resolve; }); }
      finally { concurrent -= 1; }
    },
    onData: (data) => received.push(data), onError: assert.fail,
    schedule: () => () => {},
    subscribeToChanges: (callback) => { changed = callback; return () => {}; },
  });
  changed(); changed();
  finish(1);
  await tick();
  assert.equal(reads, 2);
  assert.equal(maxConcurrent, 1);
  finish(2);
  await tick();
  assert.deepEqual(received, [1, 2]);
  unsubscribe();
});
