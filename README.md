# Good Days

Good Days is a private household journal for daily notes, photos, calendar browsing, life themes, and a short mood summary. Most use is on iPhone through a Capacitor app; the same interface is available at [gooddays.dansalazar.org](https://gooddays.dansalazar.org).

The app uses Next.js 15.5.28 in the maintained Next.js 15 release line, React 19, Firebase Authentication/Realtime Database/Storage, and a separate protected sentiment API. The website exports static files for GitHub Pages. Native Swift source, including the photo-library and Keychain bridges, is preserved in `ios/`.

## Development

Use Node.js 22 or later, npm, and Xcode for iOS work. Use the checked-in lockfiles:

```bash
npm ci
npm ci --prefix vercel-api
cp .env.example .env.local
npm run dev
```

Fill in the public Firebase project configuration and `NEXT_PUBLIC_SENTIMENT_API_URL` in `.env.local`. The app opens at `http://localhost:3000`. The browser signs in with Google. The iPhone app asks for the existing Firebase account email/password once, then keeps its refresh token in iOS Keychain. It never stores the password. The iOS WebView uses `capacitor://localhost`, an allowed origin in the protected API.

Remove old `NEXT_PUBLIC_ANTHROPIC_API_KEY` and `NEXT_PUBLIC_IOS_AUTH_*` entries from existing environment files and build settings before building. The build guard rejects unsafe public credential variable names. Anthropic credentials belong in the separate API deployment; see the [API setup](vercel-api/README.md).

Firebase access rules must restrict the shared journal and Storage to the intended household accounts. Signing in alone must not grant every account access to household data. The sentiment API separately requires a household email allowlist.

## Checks and builds

```bash
npm test
npm run typecheck
npm run lint
npm run check
npm run test:api-runtime
npm run build
npm run build:ios
npm run cap:sync
```

`check` runs TypeScript for the app and API, ESLint, the mocked test suite, and a compiled API runtime smoke check. The standalone API uses explicit ESM metadata and Node.js 22.x. Both builds write `out/`; `cap:sync` copies the current export to iOS. To preview the web export in a browser:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory out
```

Open `http://127.0.0.1:4173` and check the iPhone viewport, sign-in/error states, calendar, entry editor, photos, and themes. With this server running, `npm run test:browser` runs the local fixture-based browser smoke checks; install Chromium first with `npx playwright install chromium`. These checks simulate native bridges and provider responses. The [refactor and release guide](docs/REFACTOR.md) includes the native compile command and real-device acceptance checks.

## Data and architecture

Firebase paths remain shared household records: `moodData/{YYYYMMDD}`, `themes/{id}`, and `sentimentData/{key}`. Recent analysis uses the existing `last60` key. No per-user migration or automatic record rewrite is introduced. Legacy `photoUrl` and current `photoUrls[]` both remain readable.

Components handle presentation and editing; hooks handle entries, themes, device photos, and photo uploads; services handle authentication, persistence, and analysis. Cloud failures are shown to the user and do not silently become successful local saves. Existing localStorage records are left intact for manual recovery; they are no longer an automatic fallback.

See [CLAUDE.md](CLAUDE.md) for the module map, [current review findings](docs/review-findings.md), and [docs/REFACTOR.md](docs/REFACTOR.md) for scope and release requirements.

## Release status

The refactor was merged in [PR #4](https://github.com/SleepyGinger/good-days-dashboard/pull/4). The website and protected analysis API are published, with analysis restricted to the existing iPhone sign-in account. Production CI and a real authenticated analysis using synthetic notes passed. The iOS app has a separate release process; see [the prepared iPhone candidate](docs/IOS-RELEASE.md). Existing installed builds must transition away from embedded credentials and the retired model, followed by credential rotation.

Local integration checks passed: 51 regression tests, app/API TypeScript, ESLint, compiled API runtime checks, web/iOS static exports, Capacitor sync, unsigned and ad-hoc simulator builds with Xcode 26.5, and eight mocked browser workflow groups including the footer-error visibility check. Updated screenshots were visually reviewed. The ad-hoc simulator build launched the native email/password screen and read an empty Keychain session without an error. Hosted app/browser/security and native compile jobs passed at `dc1be24`. Production dependency audit: zero reported vulnerabilities; 17 moderate development/tooling advisories remain.

Credential scans passed for reachable Git history, tracked source, generated web/native assets, and 15 published HTML/JavaScript assets. Anonymous database and storage-list requests were denied. Native sign-in, Keychain writes/restoration/deletion, real photo-library flows, full live Firebase rule review, credential rotation, and iPhone distribution still need the release checks in the guide.

Private project.
