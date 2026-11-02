# Good Days sentiment API

This standalone Vercel function accepts journal notes from signed-in household users. The static website and native app call this same API; Anthropic credentials stay on the server. No journal notes or model output are logged by the handler.

## Server configuration

Configure these environment variables in the Vercel API project before deploying:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-only Anthropic API credential. |
| `FIREBASE_WEB_API_KEY` | Firebase project Web API key used for Firebase's `accounts:lookup` token validation. |
| `GOOD_DAYS_ALLOWED_EMAILS` | Required comma-separated household account emails. An empty list disables analysis. Accounts are checked after Firebase validates the bearer token. |
| `GOOD_DAYS_ALLOWED_ORIGINS` | Optional comma-separated exact browser origins. Defaults to `https://gooddays.dansalazar.org`. The iOS WebView origin `capacitor://localhost` is also allowed, alongside `https://localhost` for Android/older clients. HTTP localhost on port 3000 is allowed only with `NODE_ENV=development`. |
| `ANTHROPIC_MODEL` | Optional compatible Claude model override. Defaults to `claude-haiku-5-5`, using low effort and at most 2,048 output tokens. |

The default model is an economical model for short classification and summary work. Its active status and API ID were checked against [Anthropic's official model documentation](https://platform.claude.com/docs/en/models/haiku-5-5/overview) on November 1, 2026. Recheck availability before changing the model. Replacement models must support `output_config.effort`.

Set `NEXT_PUBLIC_SENTIMENT_API_URL` to the deployed function URL when building the website and native web assets. Do not put an Anthropic key in a `NEXT_PUBLIC_` variable. The client sends a current Firebase ID token as `Authorization: Bearer ...`; an old client without this header cannot use the protected endpoint.

Authentication uses Firebase's [documented account-lookup endpoint](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info), checks disabled accounts, then matches the server household allowlist. Native email/password accounts may have unverified emails; this endpoint uses the explicitly configured allowlist without requiring `emailVerified`. The allowlist must contain only the existing intended household accounts. Requests without an Origin header still require the same authentication and allowlist checks.

## Bounds and verification

Requests contain `{ "notes": [{ "date": "YYYY-MM-DD", "note": "..." }] }`. The API accepts at most 64 notes, 8,000 characters per note, 60,000 note characters total, and 256,000 request bytes. The response contains a supported letter grade and a nonempty summary of at most 2,000 characters. Firebase lookup times out after 5 seconds and the model request after 20 seconds.

The handler permits one analysis in flight and six requests per ten minutes per user **in each warm function instance**. This is best-effort throttling; instance restarts and parallel instances do not share its counters. Configure provider/account spend controls for a durable cost ceiling.

The deployed function uses Node.js 22.x and explicit ESM package metadata. Keep `.js` suffixes in server-relative imports; TypeScript resolves these to the corresponding source files. NodeNext checks enforce Node's module rules. See [Vercel's runtime configuration](https://vercel.com/docs/functions/configuring-functions/runtime).

Run `npm ci` then `npm run typecheck` in this directory. The repository's `npm test` exercises mocked authentication, origin checks, input/response validation, provider failures, throttling, and the client contract. `npm run test:api-runtime` compiles the standalone API, loads its emitted JavaScript with native Node module rules, and checks preflight, missing authentication, method and origin handling over a temporary loopback HTTP server. Both checks are included in the root `npm run check`; they use no production credentials or journal data. A real authenticated end-to-end check remains part of release verification.
