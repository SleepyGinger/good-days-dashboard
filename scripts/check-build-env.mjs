import { readFileSync } from "node:fs";

export function unsafePublicNames(env) {
  return Object.keys(env).filter((name) =>
    /^NEXT_PUBLIC_/.test(name) &&
    /ANTHROPIC|IOS_AUTH_|PASSWORD|PRIVATE_KEY|SECRET/.test(name) &&
    Boolean(env[name]?.replace(/^['"]|['"]$/g, "").trim())
  );
}

const input = { ...process.env };
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?(NEXT_PUBLIC_\w+)\s*=\s*(.*?)\s*$/);
      if (match && unsafePublicNames({ [match[1]]: match[2] }).length) input[match[1]] = match[2];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const unsafe = unsafePublicNames(input);
if (unsafe.length) {
  throw new Error(`Remove private credentials from client configuration before building: ${unsafe.join(", ")}. Use sign-in and the server-side analysis API.`);
}
