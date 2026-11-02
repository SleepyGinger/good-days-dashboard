import assert from "node:assert/strict";
import test from "node:test";
import { unsafePublicNames } from "../scripts/check-build-env.mjs";

test("a distributable build rejects private credentials while allowing public Firebase config", () => {
  assert.deepEqual(unsafePublicNames({
    NEXT_PUBLIC_FIREBASE_API_KEY: "public-project-key",
    NEXT_PUBLIC_IOS_AUTH_PASSWORD: "private-password",
    NEXT_PUBLIC_ANTHROPIC_API_KEY: "private-api-key",
    ANTHROPIC_API_KEY: "server-key",
  }), ["NEXT_PUBLIC_IOS_AUTH_PASSWORD", "NEXT_PUBLIC_ANTHROPIC_API_KEY"]);
  assert.deepEqual(unsafePublicNames({ NEXT_PUBLIC_ANTHROPIC_API_KEY: '""' }), []);
});
