import assert from "node:assert/strict";
import { test } from "node:test";
import { createSentimentClient } from "../src/lib/sentiment-client";
import { parseSentimentNotes, parseSentimentResult, SENTIMENT_LIMITS } from "../vercel-api/lib/sentiment-contract";
import { createSentimentService, DEFAULT_SENTIMENT_MODEL, type ApiRequest } from "../vercel-api/lib/sentiment-service";

const notes = [{ date: "2026-11-01", note: "A calm afternoon with family." }];
const result = { grade: "B+", summary: "A peaceful stretch with room for rest." };
const env = {
  NODE_ENV: "production",
  FIREBASE_WEB_API_KEY: "test-firebase-project",
  GOOD_DAYS_ALLOWED_EMAILS: "dan@example.com,maria@example.com",
  ANTHROPIC_API_KEY: "test-server-secret",
};

function request(headers: ApiRequest["headers"] = {}, body: unknown = { notes }): ApiRequest {
  return { method: "POST", headers: { origin: "https://gooddays.dansalazar.org", "content-type": "application/json", authorization: "Bearer test-token", ...headers }, body };
}

function upstream({ email = "dan@example.com", disabled = false, authStatus = 200, modelStatus = 200, output = result, stopReason = "end_turn" } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://identitytoolkit.googleapis.com/")) {
      return Response.json({ users: [{ localId: "household-user", email, emailVerified: false, disabled }] }, { status: authStatus });
    }
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    return Response.json({ stop_reason: stopReason, content: [{ type: "text", text: JSON.stringify(output) }] }, { status: modelStatus });
  };
  return { fetcher, calls };
}

test("sentiment API rejects unauthenticated requests without reaching providers", async () => {
  const { fetcher, calls } = upstream();
  const service = createSentimentService({ env, fetcher });
  assert.equal((await service(request({ authorization: undefined }))).status, 401);
  assert.equal((await service(request({ authorization: "Basic secret" }))).status, 401);
  assert.equal(calls.length, 0);
});

test("Firebase rejects invalid tokens; household allowlist rejects other and disabled users", async () => {
  for (const [options, expected] of [
    [{ authStatus: 400 }, 401],
    [{ email: "stranger@example.com" }, 403],
    [{ disabled: true }, 401],
  ] as const) {
    const { fetcher, calls } = upstream(options);
    assert.equal((await createSentimentService({ env, fetcher })(request())).status, expected);
    assert.equal(calls.length, 1);
  }
});

test("server configuration fails closed without the allowlist or Firebase project key", async () => {
  for (const missing of ["GOOD_DAYS_ALLOWED_EMAILS", "FIREBASE_WEB_API_KEY"]) {
    const { fetcher, calls } = upstream();
    assert.equal((await createSentimentService({ env: { ...env, [missing]: "" }, fetcher })(request())).status, 503);
    assert.equal(calls.length, 0);
  }
});

test("CORS permits production and native origins, excludes strangers and production HTTP localhost", async () => {
  const { fetcher, calls } = upstream();
  const service = createSentimentService({ env, fetcher });
  for (const origin of ["https://gooddays.dansalazar.org", "capacitor://localhost", "https://localhost"]) {
    const response = await service({ ...request({ origin }), method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(response.headers["Access-Control-Allow-Origin"], origin);
    assert.match(response.headers["Access-Control-Allow-Headers"], /Authorization/);
  }
  for (const origin of ["https://untrusted.example", "http://localhost:3000", "null"]) {
    const response = await service(request({ origin }));
    assert.equal(response.status, 403);
    assert.equal(response.headers["Access-Control-Allow-Origin"], undefined);
  }
  assert.equal(calls.length, 0);
  const development = createSentimentService({ env: { ...env, NODE_ENV: "development" }, fetcher });
  assert.equal((await development({ ...request({ origin: "http://localhost:3000" }), method: "OPTIONS" })).status, 204);
});

test("malformed and oversized notes never reach Firebase or the model", async () => {
  const { fetcher, calls } = upstream();
  const service = createSentimentService({ env, fetcher });
  for (const body of ["{invalid JSON", {}, { notes: [] }, { notes: [{ date: "2026-02-30", note: "Invalid date" }] },
    { notes: [{ date: "2026-11-01", note: "x".repeat(SENTIMENT_LIMITS.noteCharacters + 1) }] },
    { notes: Array.from({ length: SENTIMENT_LIMITS.notes + 1 }, () => notes[0]) }]) {
    assert.equal((await service(request({}, body))).status, 400);
  }
  assert.equal((await service(request({ "content-length": String(SENTIMENT_LIMITS.bodyBytes + 1) }))).status, 413);
  assert.equal((await service(request({}, "x".repeat(SENTIMENT_LIMITS.bodyBytes + 1)))).status, 413);
  assert.equal((await service(request({ "content-type": "text/plain" }))).status, 415);
  assert.equal(calls.length, 0);
});

test("allowed accounts use the single server prompt and supported configurable model", async () => {
  const { fetcher, calls } = upstream({ email: "DAN@example.com" });
  const response = await createSentimentService({ env, fetcher })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, result);
  assert.equal(response.headers["Cache-Control"], "no-store");
  const authPayload = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(authPayload, { idToken: "test-token" });
  const modelPayload = JSON.parse(String(calls[1].init?.body));
  assert.equal(modelPayload.model, DEFAULT_SENTIMENT_MODEL);
  assert.match(modelPayload.system, /last 60 days/);
  assert.deepEqual(JSON.parse(modelPayload.messages[0].content), { entries: notes });
  assert.equal(new Headers(calls[1].init?.headers).get("x-api-key"), env.ANTHROPIC_API_KEY);
  const other = upstream();
  await createSentimentService({ env: { ...env, ANTHROPIC_MODEL: "deployment-model" }, fetcher: other.fetcher })(request());
  assert.equal(JSON.parse(String(other.calls[1].init?.body)).model, "deployment-model");
});

test("upstream failures and invalid or truncated model responses are handled safely", async () => {
  for (const [options, expected] of [
    [{ modelStatus: 429 }, 503],
    [{ modelStatus: 500 }, 503],
    [{ output: { grade: "99", summary: "Not a letter grade" } }, 502],
    [{ output: { grade: "A", summary: "" } }, 502],
    [{ stopReason: "max_tokens" }, 502],
  ] as const) {
    const { fetcher } = upstream(options);
    const response = await createSentimentService({ env, fetcher })(request());
    assert.equal(response.status, expected);
    assert.ok(!JSON.stringify(response.body).includes(notes[0].note));
  }
});

test("warm-instance throttling limits requests and expires the window", async () => {
  const { fetcher } = upstream();
  let time = 100;
  const service = createSentimentService({ env, fetcher, now: () => time });
  for (let attempt = 0; attempt < 6; attempt++) assert.equal((await service(request())).status, 200);
  const throttled = await service(request());
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers["Retry-After"], "600");
  time += 10 * 60_000;
  assert.equal((await service(request())).status, 200);
});

test("an in-flight analysis cannot be duplicated for the same user", async () => {
  const { fetcher: normal } = upstream();
  let complete!: (response: Response) => void;
  let started!: () => void;
  const modelStarted = new Promise<void>((resolve) => { started = resolve; });
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).startsWith("https://identitytoolkit.googleapis.com/")) return normal(input, init);
    started();
    return new Promise<Response>((resolve) => { complete = resolve; });
  };
  const service = createSentimentService({ env, fetcher });
  const first = service(request());
  await modelStarted;
  assert.equal((await service(request())).status, 429);
  complete(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(result) }] }));
  assert.equal((await first).status, 200);
});

test("provider timeouts return a safe gateway error", async () => {
  const fetcher: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const service = createSentimentService({ env, fetcher, authTimeoutMs: 1 });
  assert.equal((await service(request())).status, 504);
});

test("contract accepts supported grades and rejects invalid result fields", () => {
  for (const grade of ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"]) {
    assert.deepEqual(parseSentimentResult({ grade, summary: "  Rest and connection.  " }), { grade, summary: "Rest and connection." });
  }
  for (const invalid of [null, [], { grade: "F+", summary: "x" }, { grade: "A", summary: 3 }, { grade: "A", summary: "x".repeat(2_001) }]) {
    assert.throws(() => parseSentimentResult(invalid));
  }
  assert.deepEqual(parseSentimentNotes({ notes }), notes);
});

test("client sends a fresh bearer token and accepts only a valid response", async () => {
  let received: RequestInit | undefined;
  const analyze = createSentimentClient({ endpoint: "https://api.example/analyze", getToken: async () => "fresh-token", fetcher: async (_input, init) => {
    received = init;
    return Response.json(result);
  } });
  assert.deepEqual(await analyze(notes), result);
  assert.equal(new Headers(received?.headers).get("Authorization"), "Bearer fresh-token");
  assert.equal(received?.credentials, "omit");
  const invalid = createSentimentClient({ endpoint: "https://api.example/analyze", getToken: async () => "token", fetcher: async () => Response.json({ grade: "100", summary: "x" }) });
  await assert.rejects(invalid(notes), /invalid/i);
});

test("client reports expired authentication, access denial, throttling, and timeout", async () => {
  for (const [status, message] of [[401, /sign-in expired/i], [403, /cannot use/i], [429, /too many/i], [503, /unavailable/i]] as const) {
    const analyze = createSentimentClient({ endpoint: "https://api.example/analyze", getToken: async () => "token", fetcher: async () => Response.json({}, { status }) });
    await assert.rejects(analyze(notes), message);
  }
  const timeout = createSentimentClient({ endpoint: "https://api.example/analyze", getToken: async () => "token", timeoutMs: 1, fetcher: async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  await assert.rejects(timeout(notes), /timed out/i);
});
