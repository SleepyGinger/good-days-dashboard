import test from "node:test";
import assert from "node:assert/strict";
import { createCloudDataClient } from "../src/lib/cloudDataClient.ts";

test("writes use authenticated REST and notify only after cloud acknowledgement", async () => {
  const changes: string[] = [];
  const writes: { url: string; options: RequestInit }[] = [];
  const client = createCloudDataClient({
    databaseURL: "https://example.invalid/",
    getToken: async (uid) => { assert.equal(uid, "expected-user"); return "fresh token"; },
    request: async (url, options) => {
      assert.deepEqual(changes, []);
      writes.push({ url, options });
      return { ok: true, status: 200, data: { note: "Saved note" } };
    },
    onMutation: (path) => changes.push(path),
  });
  await client("moodData/20261101", "PUT", { note: "Saved note" }, "expected-user");
  assert.equal(writes[0]?.url, "https://example.invalid/moodData/20261101.json?auth=fresh%20token");
  assert.equal(writes[0]?.options.method, "PUT");
  assert.deepEqual(JSON.parse(String(writes[0]?.options.body)), { note: "Saved note" });
  assert.deepEqual(changes, ["moodData/20261101"]);
});

test("cloud denial and network failure propagate without success notifications", async () => {
  for (const failure of ["denied", "offline"] as const) {
    const changes: string[] = [];
    const client = createCloudDataClient({
      databaseURL: "https://example.invalid", getToken: async () => "token",
      request: async () => {
        if (failure === "offline") throw new Error("offline");
        return { ok: false, status: 403, data: null };
      },
      onMutation: (path) => changes.push(path),
    });
    await assert.rejects(client("themes/stable-id", "PUT", {}), failure === "denied" ? /access was denied/ : /offline/);
    assert.deepEqual(changes, []);
  }
});

test("token timeout cannot start a late database write", async () => {
  let finish!: (token: string) => void;
  let writes = 0;
  const client = createCloudDataClient({
    databaseURL: "https://example.invalid", tokenTimeoutMs: 5,
    getToken: () => new Promise<string>((resolve) => { finish = resolve; }),
    request: async () => { writes += 1; return { ok: true, status: 200, data: null }; },
  });
  await assert.rejects(client("moodData/20261101", "PUT", {}), /verification timed out/);
  finish("late-token");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writes, 0);
});

test("changed account rejects a write before any journal request", async () => {
  let writes = 0;
  const client = createCloudDataClient({
    databaseURL: "https://example.invalid",
    getToken: async (uid) => { assert.equal(uid, "old-user"); throw new Error("Your sign-in changed"); },
    request: async () => { writes += 1; return { ok: true, status: 200, data: null }; },
  });
  await assert.rejects(client("themes/stable-id", "DELETE", undefined, "old-user"), /sign-in changed/);
  assert.equal(writes, 0);
});
