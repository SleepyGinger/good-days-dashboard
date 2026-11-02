import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function checkCompiledHandler(directory) {
  const { default: handler } = await import(pathToFileURL(join(directory, "api/analyze-sentiment.js")).href);
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    const origin = "https://gooddays.dansalazar.org";
    const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: origin } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
    assert.ok(preflight.headers.get("Access-Control-Allow-Headers").includes("Authorization"));
    assert.equal((await fetch(url, { method: "POST", headers: { Origin: origin } })).status, 401);
    assert.equal((await fetch(url, { headers: { Origin: origin } })).status, 405);
    assert.equal((await fetch(url, { method: "OPTIONS", headers: { Origin: "https://other.invalid" } })).status, 403);
    console.log("Compiled API runtime: preflight, authentication, method and origin checks passed.");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv[2]) {
  await checkCompiledHandler(process.argv[2]);
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "good-days-api-runtime-"));
  try {
    const compile = spawnSync(process.execPath, [
      join(root, "vercel-api/node_modules/typescript/bin/tsc"),
      "--project", join(root, "vercel-api/tsconfig.json"), "--noEmit", "false", "--outDir", directory,
    ], { cwd: root, stdio: "inherit" });
    if (compile.error) throw compile.error;
    assert.equal(compile.status, 0, "Standalone API compilation failed.");
    copyFileSync(join(root, "vercel-api/package.json"), join(directory, "package.json"));
    // Match hosts that require explicit package module metadata rather than syntax detection.
    const check = spawnSync(process.execPath, [
      "--no-experimental-detect-module", fileURLToPath(import.meta.url), directory,
    ], { cwd: root, stdio: "inherit", env: { NODE_ENV: "production" } });
    if (check.error) throw check.error;
    process.exitCode = check.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
