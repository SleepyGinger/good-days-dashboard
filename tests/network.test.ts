import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/lib/network.ts";

test("native requests time out rather than leaving sign-in or saves pending", async (context) => {
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  await assert.rejects(requestJson("https://example.invalid", { method: "GET" }, 5), /request timed out/);
});

test("native request timeout covers a stalled JSON body as well as the connection", async (context) => {
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => ({
    ok: true, status: 200,
    json: () => new Promise<unknown>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  }));
  await assert.rejects(requestJson("https://example.invalid", { method: "GET" }, 5), /request timed out/);
});

test("HTTP errors remain available without requiring a JSON error body", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("not JSON", { status: 401 }));
  assert.deepEqual(await requestJson("https://example.invalid", { method: "GET" }), { ok: false, status: 401, data: null });
});
