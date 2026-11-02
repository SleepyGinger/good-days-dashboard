import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseUrl = process.env.GOOD_DAYS_TEST_URL || "http://127.0.0.1:4173";
const localOrigin = new URL(baseUrl).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname), "Browser smoke tests only run against a local server.");
const screenshots = process.env.GOOD_DAYS_SCREENSHOT_DIR || resolve(tmpdir(), "good-days-browser-smoke");
await mkdir(screenshots, { recursive: true });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const imageDataUrl = `data:image/png;base64,${png}`;
const today = "2026-11-01";
const checks = [];
const passed = (description) => { checks.push(description); console.log(`PASS ${description}`); };
let activePage;
let activeState;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});

async function waitUntil(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await delay(25);
  }
}

async function createScenario(restore) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  const state = {
    entries: { "20261031": { date: "2026-10-31", day: "Good day", energy: "Energized", touch: "Touching", note: "Synthetic saved day" } },
    themes: { "synthetic-theme": { title: "Synthetic November theme", start: "2026-11-02", end: "2026-11-03", color: "#93c5fd" } },
    entryWrites: [], themeWrites: [], uploadRequests: 0, failNextEntryWrite: false,
    releaseUpload: null, uploadGate: null,
    pageErrors: [], consoleErrors: [], unexpectedRequests: [],
  };
  await context.addInitScript(({ restore, imageDataUrl }) => {
    const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ["2026-11-01T20:00:00.000Z"])); }
      static now() { return new OriginalDate("2026-11-01T20:00:00.000Z").getTime(); }
    };
    window.__GOOD_DAYS_NATIVE_CALLS = [];
    window.__GOOD_DAYS_REFRESH_TOKEN = restore ? "synthetic-refresh-token" : null;
    window.CapacitorCustomPlatform = { name: "ios" };
    const methods = (names) => names.map((name) => ({ name, rtype: "promise" }));
    window.Capacitor = {
      PluginHeaders: [
        { name: "Session", methods: methods(["getRefreshToken", "setRefreshToken", "clearRefreshToken"]) },
        { name: "PhotoDay", methods: methods(["checkPermissions", "requestPermissions", "getPhotosForDate", "getFullPhoto", "releasePhotos"]) },
      ],
      convertFileSrc: (path) => path,
      nativePromise: async (plugin, method, options = {}) => {
        window.__GOOD_DAYS_NATIVE_CALLS.push({ plugin, method, options });
        if (plugin === "Session") {
          if (method === "getRefreshToken") return { refreshToken: window.__GOOD_DAYS_REFRESH_TOKEN ?? undefined };
          if (method === "setRefreshToken") { window.__GOOD_DAYS_REFRESH_TOKEN = options.refreshToken; return {}; }
          if (method === "clearRefreshToken") { window.__GOOD_DAYS_REFRESH_TOKEN = null; return {}; }
        }
        if (plugin === "PhotoDay") {
          if (method === "checkPermissions" || method === "requestPermissions") return { photos: "granted" };
          if (method === "getPhotosForDate") {
            const more = (options.offset ?? 0) > 0;
            const ids = more ? ["synthetic-device-c"] : ["synthetic-device-a", "synthetic-device-b"];
            return { photos: ids.map((id) => ({ id, thumbnailPath: imageDataUrl })), hasMore: !more, nextOffset: more ? 3 : 2 };
          }
          if (method === "getFullPhoto") return { filePath: imageDataUrl };
          if (method === "releasePhotos") return {};
        }
        throw new Error(`Unexpected mock plugin call: ${plugin}.${method}`);
      },
    };
  }, { restore, imageDataUrl });

  // Every remote HTTP request is fulfilled locally or aborted. No real account,
  // database, image bucket, or analysis service is contacted by this test.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === localOrigin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "*" };
    const json = (body, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.hostname === "securetoken.googleapis.com") {
      return json({ id_token: "synthetic-id-token", refresh_token: "synthetic-refreshed-token", expires_in: "3600", user_id: "synthetic-user" });
    }
    if (url.hostname === "identitytoolkit.googleapis.com") {
      if (url.pathname.endsWith(":lookup")) return json({ users: [{ localId: "synthetic-user", email: "smoke@example.invalid" }] });
      if (url.pathname.endsWith(":signInWithPassword")) return json({ idToken: "synthetic-id-token", refreshToken: "synthetic-refresh-token", expiresIn: "3600", localId: "synthetic-user", email: "smoke@example.invalid" });
    }
    if (url.hostname.endsWith(".firebaseio.com") || url.hostname.endsWith(".firebasedatabase.app")) {
      const path = url.pathname.replace(/^\//, "").replace(/\.json$/, "");
      if (request.method() === "GET") return json(path === "moodData" ? state.entries : path === "themes" ? state.themes : null);
      const body = request.postDataJSON();
      if (request.method() === "PUT" && path.startsWith("moodData/")) {
        state.entryWrites.push({ path, body });
        if (state.failNextEntryWrite) { state.failNextEntryWrite = false; return json({ error: "Synthetic write failure" }, 500); }
        state.entries[path.split("/")[1]] = body;
        return json(body);
      }
      if (request.method() === "PUT" && path.startsWith("themes/")) {
        state.themeWrites.push({ path, body });
        state.themes[path.split("/")[1]] = body;
        return json(body);
      }
    }
    if (url.hostname === "firebasestorage.googleapis.com") {
      if (request.method() === "POST") {
        state.uploadRequests += 1;
        if (state.uploadGate) await state.uploadGate;
        return json({ name: url.searchParams.get("name"), downloadTokens: "synthetic-download-token" });
      }
      if (request.method() === "GET") return route.fulfill({ status: 200, headers, contentType: "image/png", body: Buffer.from(png, "base64") });
    }
    state.unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**", (socket) => {
    state.unexpectedRequests.push("Unexpected WebSocket request");
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  activePage = page;
  activeState = state;
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  page.on("console", (message) => {
    // The failed-write scenario deliberately receives an HTTP 500 response.
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 500/.test(message.text())) state.consoleErrors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { context, page, state };
}

function assertClean(state) {
  assert.deepEqual(state.pageErrors, [], "No uncaught browser errors");
  assert.deepEqual(state.consoleErrors, [], "No unexpected browser console errors");
  assert.deepEqual(state.unexpectedRequests, [], "No unhandled remote requests (all external network is blocked)");
}

try {
  const signedOut = await createScenario(false);
  await signedOut.page.getByLabel("Email", { exact: true }).waitFor();
  assert.equal(await signedOut.page.getByLabel("Password", { exact: true }).isVisible(), true);
  await signedOut.page.screenshot({ path: resolve(screenshots, "good-days-sign-in.png"), fullPage: true });
  await signedOut.page.getByLabel("Email", { exact: true }).fill("smoke@example.invalid");
  await signedOut.page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await signedOut.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await signedOut.page.getByText("Synthetic saved day", { exact: true }).waitFor();
  assert.equal(await signedOut.page.evaluate(() => window.__GOOD_DAYS_REFRESH_TOKEN), "synthetic-refresh-token");
  assertClean(signedOut.state);
  passed("Native sign-in form and explicit email/password sign-in");
  await signedOut.context.close();

  const { page, context, state } = await createScenario(true);
  await page.getByText("Synthetic saved day", { exact: true }).waitFor();
  assert.match(await page.locator("main").innerText(), /Oct 31, 2026/i);
  passed("Keychain refresh-token restore and synthetic journal load");

  await page.locator('[data-day="2026-11-02"] button').click();
  const theme = page.getByRole("dialog", { name: "Edit Theme" });
  await theme.waitFor();
  assert.equal(await theme.locator("input").inputValue(), "Synthetic November theme");
  assert.match(await theme.innerText(), /From 2026-11-02[\s\S]*2026-11-03/);
  await theme.getByRole("button", { name: "Save", exact: true }).click();
  await theme.waitFor({ state: "hidden" });
  assert.equal(state.themeWrites.length, 1);
  assert.deepEqual([state.themeWrites[0].body.start, state.themeWrites[0].body.end], ["2026-11-02", "2026-11-03"]);
  passed("Existing theme local date range survives editing and saving");

  await page.getByRole("button", { name: "New entry", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "New Entry", exact: true });
  await editor.waitFor();
  await editor.getByLabel("Note", { exact: true }).fill("Synthetic draft that should be discarded");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "New entry", exact: true }).click();
  editor = page.getByRole("dialog", { name: "New Entry", exact: true });
  await editor.waitFor();
  assert.equal(await editor.getByLabel("Note", { exact: true }).inputValue(), "");
  passed("Cancel followed by New entry starts an empty draft");

  const note = "Synthetic note retained through overlays, photo upload, and a failed save";
  await editor.getByLabel("Note", { exact: true }).fill(note);
  await editor.getByRole("button", { name: "Load more photos", exact: true }).click();
  await editor.getByRole("button", { name: "Choose device photo 3", exact: true }).waitFor();
  await editor.getByRole("button", { name: "Choose device photo 1", exact: true }).click();
  await page.getByRole("button", { name: "Close device photos", exact: true }).waitFor();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Upload 1 Photo", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Close device photos", exact: true }).click();
  await editor.waitFor();
  assert.equal(await editor.getByLabel("Note", { exact: true }).inputValue(), note);
  passed("Device-photo pagination and gallery controls preserve the entry draft");

  state.uploadGate = new Promise((done) => { state.releaseUpload = done; });
  await editor.locator('input[type="file"]').setInputFiles({ name: "synthetic-photo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await waitUntil(() => state.uploadRequests === 1, "The synthetic photo upload should start");
  assert.equal(await editor.getByRole("button", { name: "Uploading photos…", exact: true }).isDisabled(), true);
  assert.equal(await editor.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
  assert.equal(state.entryWrites.length, 0);
  state.releaseUpload();
  await editor.getByRole("button", { name: "Save", exact: true }).waitFor();
  await editor.getByAltText("Photo 1", { exact: true }).waitFor();
  await editor.getByAltText("Photo 1", { exact: true }).click();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await editor.waitFor();
  assert.equal(await editor.getByLabel("Note", { exact: true }).inputValue(), note);
  passed("Photo upload locks Save/Cancel; attached-photo lightbox preserves draft");

  state.failNextEntryWrite = true;
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const saveError = editor.getByRole("alert");
  await saveError.waitFor();
  const errorBox = await saveError.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(errorBox && viewport && errorBox.y >= 0 && errorBox.y + errorBox.height <= viewport.height,
    "A failed-save error must be visible in the viewport without manual scrolling.");
  assert.equal(await editor.getByLabel("Note", { exact: true }).inputValue(), note);
  assert.equal(await editor.isVisible(), true);
  assert.equal(state.entryWrites.length, 1);
  assert.equal(state.entries["20261101"], undefined);
  await page.screenshot({ path: resolve(screenshots, "good-days-editor.png"), fullPage: true });
  passed("Failed journal PUT preserves the draft and shows its error above Save");

  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(state.entryWrites.length, 2);
  const saved = state.entries["20261101"];
  assert.equal(saved.date, today);
  assert.equal(saved.note, note);
  assert.equal(saved.photoUrls.length, 1);
  assert.match(saved.photoUrls[0], /synthetic-download-token/);
  await page.getByText("Good Day", { exact: true }).waitFor();
  await page.getByText("Good Day", { exact: true }).waitFor({ state: "hidden", timeout: 6_000 });
  await page.locator('[data-day="2026-11-01"] button').click();
  const savedEditor = page.getByRole("dialog", { name: "Edit Entry", exact: true });
  await savedEditor.waitFor();
  assert.equal(await savedEditor.getByLabel("Note", { exact: true }).inputValue(), note);
  assert.match(await savedEditor.innerText(), /Sun, Nov 1, 2026/);
  await savedEditor.getByRole("button", { name: "Cancel", exact: true }).click();
  passed("Retry saves and reopens the correct local date and successful photo reference");
  assertClean(state);
  await context.close();
  console.log(JSON.stringify({ passed: checks.length, checks, screenshots, externalNetwork: "blocked; all auth, database, storage, and native plugins use synthetic fixtures" }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: resolve(screenshots, "good-days-browser-failure.png"), fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ completedChecks: checks, bodyText: (await activePage.locator("body").innerText()).slice(-3000), pageErrors: activeState?.pageErrors, consoleErrors: activeState?.consoleErrors, unexpectedRequests: activeState?.unexpectedRequests }, null, 2));
  }
  throw error;
} finally {
  await browser.close();
}
