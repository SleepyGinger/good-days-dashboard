import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSession, type NativeAuthResult, type RefreshTokenStore } from "../src/lib/nativeSession.ts";

const user = { uid: "household-user", email: "person@example.com" };
const result = (idToken: string, refreshToken = "refresh-token"): NativeAuthResult => ({ idToken, refreshToken, expiresIn: 3600, user });

function memoryStore(initial: string | null = null) {
  let value = initial;
  const store: RefreshTokenStore = {
    read: async () => value,
    write: async (next) => { value = next; },
    clear: async () => { value = null; },
  };
  return { store, value: () => value };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test("native sign-in persists only the refresh token and uses the active ID token", async () => {
  const storage = memoryStore();
  const session = createNativeSession({ store: storage.store, signIn: async () => result("id-token"), refresh: async () => result("renewed-token") });
  assert.deepEqual(await session.signIn("person@example.com", "user-entered-password"), user);
  assert.equal(storage.value(), "refresh-token");
  assert.equal(await session.getIdToken(), "id-token");
});

test("concurrent requests share one token renewal before expiry", async () => {
  const storage = memoryStore();
  let clock = 0;
  let refreshes = 0;
  const pending = deferred<NativeAuthResult>();
  const session = createNativeSession({
    store: storage.store, now: () => clock,
    signIn: async () => result("initial"),
    refresh: async (token) => { assert.equal(token, "refresh-token"); refreshes += 1; return pending.promise; },
  });
  await session.signIn("person@example.com", "password");
  clock = 3_550_000;
  const first = session.getIdToken();
  const second = session.getIdToken();
  pending.resolve(result("renewed", "rotated-refresh"));
  assert.deepEqual(await Promise.all([first, second]), ["renewed", "renewed"]);
  assert.equal(refreshes, 1);
  assert.equal(storage.value(), "rotated-refresh");
});

test("restore exchanges the saved refresh token and logout clears access and persistence", async () => {
  const storage = memoryStore("saved-refresh");
  const session = createNativeSession({
    store: storage.store, signIn: async () => result("unused"),
    refresh: async (token) => { assert.equal(token, "saved-refresh"); return result("restored-id"); },
  });
  assert.deepEqual(await session.restore(), user);
  assert.equal(await session.getIdToken(), "restored-id");
  await session.logout();
  assert.equal(storage.value(), null);
  await assert.rejects(session.getIdToken(), /sign in/);
});

test("logout invalidates a renewal that completes afterward", async () => {
  const storage = memoryStore();
  let clock = 0;
  const pending = deferred<NativeAuthResult>();
  const session = createNativeSession({ store: storage.store, now: () => clock, signIn: async () => result("initial"), refresh: () => pending.promise });
  await session.signIn("person@example.com", "password");
  clock = 3_600_000;
  const token = session.getIdToken();
  const rejected = assert.rejects(token, /session changed/);
  await session.logout();
  pending.resolve(result("late-id", "late-refresh"));
  await rejected;
  assert.equal(storage.value(), null);
  await assert.rejects(session.getIdToken(), /sign in/);
});

test("logout queues Keychain deletion after an in-flight write", async () => {
  const storage = memoryStore();
  const saving = deferred<void>();
  const writeStarted = deferred<void>();
  const session = createNativeSession({
    store: {
      ...storage.store,
      write: async (token) => { writeStarted.resolve(); await saving.promise; await storage.store.write(token); },
    },
    signIn: async () => result("initial"), refresh: async () => result("unused"),
  });
  const signIn = session.signIn("person@example.com", "password");
  const rejected = assert.rejects(signIn, /session changed/);
  await writeStarted.promise;
  const logout = session.logout();
  saving.resolve();
  await Promise.all([rejected, logout]);
  assert.equal(storage.value(), null);
});

test("Keychain errors propagate instead of pretending sign-in succeeded", async () => {
  const storage = memoryStore();
  const session = createNativeSession({
    store: { ...storage.store, write: async () => { throw new Error("Keychain is unavailable"); } },
    signIn: async () => result("initial"), refresh: async () => result("unused"),
  });
  await assert.rejects(session.signIn("person@example.com", "password"), /Keychain is unavailable/);
  await assert.rejects(session.getIdToken(), /sign in/);
  assert.equal(storage.value(), null);
});

test("failed renewal is retryable and cannot return an expired token", async () => {
  const storage = memoryStore();
  let clock = 0;
  let attempts = 0;
  const session = createNativeSession({
    store: storage.store, now: () => clock, signIn: async () => result("initial"),
    refresh: async () => { attempts += 1; if (attempts === 1) throw new Error("offline"); return result("renewed"); },
  });
  await session.signIn("person@example.com", "password");
  clock = 3_600_000;
  await assert.rejects(session.getIdToken(), /offline/);
  assert.equal(await session.getIdToken(), "renewed");
  assert.equal(attempts, 2);
});

test("a delayed restore cannot replace a newer manual sign-in", async () => {
  const storage = memoryStore("old-refresh");
  const restoring = deferred<NativeAuthResult>();
  const refreshStarted = deferred<void>();
  const session = createNativeSession({
    store: storage.store,
    signIn: async () => result("manual-id", "manual-refresh"),
    refresh: async () => { refreshStarted.resolve(); return restoring.promise; },
  });
  const restore = session.restore();
  const rejected = assert.rejects(restore, /session changed/);
  await refreshStarted.promise;
  await session.signIn("person@example.com", "password");
  restoring.resolve(result("stale-id", "stale-refresh"));
  await rejected;
  assert.equal(await session.getIdToken(), "manual-id");
  assert.equal(storage.value(), "manual-refresh");
});
