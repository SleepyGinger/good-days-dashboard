# Working on Good Days

Read this file, [README.md](README.md), [docs/REFACTOR.md](docs/REFACTOR.md), and the relevant module before changing behavior. Most use is on an iPhone. Preserve the phone workflow and verify native behavior separately from browser behavior.

## Commands

Use Node.js 22 or later (`.nvmrc`) and the lockfiles in the repository root and `vercel-api/`.

```bash
npm ci
npm ci --prefix vercel-api
npm run dev         # Next dev server, port 3000
npm test            # Node test runner via tsx; mocked providers and pure logic
npm run typecheck   # App and standalone API TypeScript
npm run lint        # src, tests, scripts, and API
npm run check       # TypeScript + lint + tests
npm run test:browser # Local fixture smoke checks; serve out/ on port 4173 first
npm run build       # Static web export to out/
npm run build:ios   # Export for native assets to out/
npm run cap:sync    # Copy current out/ assets and synchronize iOS plugins
```

There is one `next.config.js`. Both deployment targets use root-relative assets, trailing slashes, and unoptimized remote images. Next.js and `eslint-config-next` are pinned together at 15.5.28. Build lint/type failures are not bypassed. The old Node localStorage polyfills and duplicate config have been removed.

Keep iOS `iosScheme: "capacitor"`. Capacitor 8 normalizes unsupported `http`/`https` schemes to this default; making it explicit preserves the normalized native origin. Keychain/REST handles native sessions without a WebView auth-persistence scheme workaround.

`npm run deploy` performs checks/build and pushes Git. `npm run deploy:ios` also synchronizes native assets and creates/exports a signed archive. These are release operations; use the individual check/build commands during implementation. The Pages workflow deploys `main`. Keep a refactor on its branch/PR until the concrete release steps in the guide are ready.

## Module map

| Area | Files |
| --- | --- |
| Routes and static shell | `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/layout.tsx` |
| Dashboard composition | `src/components/GoodDaysDashboard.tsx` |
| Entry and calendar UI | `EntryEditor.tsx`, `EntryViewer.tsx`, `MoodCalendar.tsx`, `ThemeDrawer.tsx` |
| Photo presentation | `src/components/photos/DayPhotoGallery.tsx`, `PhotoLightbox.tsx` |
| Data hooks | `src/hooks/useEntries.ts`, `useThemes.ts` |
| Photo lifecycle | `src/hooks/useDayPhotos.ts`, `useEntryPhotos.ts`, `src/lib/photoUploadCoordinator.ts` |
| Shared types and dates | `src/lib/domain.ts`, `src/lib/dates.ts` |
| Firebase initialization | `src/lib/firebaseClient.ts`, `sharedInitialization.ts` |
| Authentication | `src/lib/authService.ts`, `nativeSession.ts`, `nativeSessionPlugin.ts` |
| Persistence and validation | `src/lib/dataService.ts`, `cloudDataClient.ts`, `dataRecords.ts`, `dataSubscriptions.ts`, `network.ts` |
| Photo upload and native API | `src/lib/photoStorageService.ts`, `photoDayPlugin.ts` |
| Sentiment | `src/components/SentimentSummary.tsx`, `src/lib/sentiment-client.ts`, `vercel-api/lib/` |
| Native bridges | `ios/App/App/PhotoDayPlugin.swift`, `SessionPlugin.swift`, `ViewController.swift` |

## Invariants

- Keep shared Firebase roots `moodData/{YYYYMMDD}`, `themes/{id}`, and `sentimentData/{key}`. `last60` remains the recent-analysis key. User IDs authenticate requests and scope photo paths; they do not migrate the shared journal into user-specific roots.
- Preserve entry day/energy/touch values and legacy `photoUrl` alongside `photoUrls[]` compatibility. Use `getEntryPhotos()` to read photos.
- Treat ISO journal dates as local calendar days. Use `isoLocal`, `isoToKey`, and `isoToLocalDate`; avoid UTC conversion for local-day keys.
- Surface failed cloud reads/writes. Keep the draft after a failed save and celebrate only after successful persistence. Do not restore silent localStorage fallback or erase old localStorage records; recovery is a separate manual operation.
- Browser auth uses Firebase's Google sign-in and shared initialization. Native auth uses user-entered Firebase email/password, refreshes expiring tokens, and stores only the refresh token in Keychain. Logout invalidates in-flight renewal and clears Keychain. Keep async generation/cleanup guards.
- Native collection reads poll without overlap; browser collection reads use Firebase listeners. Mutations on both platforms use bounded REST requests with a fresh token, avoiding an offline SDK write queue. Clean up subscriptions and discard stale results after auth, date, draft, or component changes.
- Upload at most three photos, prevent save during pending uploads, and discard results belonging to an old draft. Preserve native permission states, pagination, and temporary-file cleanup.
- The client sends a Firebase bearer token to the protected sentiment API. Keep one prompt/parser and server-only Anthropic credentials. Do not add a direct-browser Anthropic path or a POST route inside the static export.

## Configuration and release boundaries

Public Firebase configuration and `NEXT_PUBLIC_SENTIMENT_API_URL` are build inputs. Delete deprecated `NEXT_PUBLIC_ANTHROPIC_API_KEY` and `NEXT_PUBLIC_IOS_AUTH_*` values from old `.env.local` files and build settings before builds. Never print credential values while diagnosing configuration. The build guard checks unsafe public variable names.

The standalone API needs `ANTHROPIC_API_KEY`, `FIREBASE_WEB_API_KEY`, and `GOOD_DAYS_ALLOWED_EMAILS`; optional origins/model settings are documented in [vercel-api/README.md](vercel-api/README.md). iOS uses `capacitor://localhost`; the API also permits `https://localhost` for Android/older clients. The email allowlist is required and fails closed. API authentication does not replace Firebase database/Storage rules. The default supported model is economical Haiku 5.5; check official lifecycle documentation before changing it.

Track intentional Xcode/Swift/configuration source. Ignore generated web assets under `ios/App/App/public`, dependency/build caches, archives, signing material, and `.env*` files. `cap sync` does not recreate custom Swift plugins from a clean project.

After replacing old installed clients, rotate the formerly embedded Anthropic credential and Firebase account password and revoke old sessions. Removing a value from source or a local env file does not remove it from an installed app. Do not claim rotation, production rule verification, deployment, or real-device behavior without current evidence.

## Verification status

Local integration checks passed: 49 tests, app/API TypeScript, ESLint, web/iOS exports, Capacitor sync, unsigned and normal ad-hoc simulator builds with Xcode 26.5, and eight mocked browser workflow groups including footer-error visibility. Updated screenshots were visually reviewed. The ad-hoc build launched the actual native email/password screen; the Session bridge read an empty Keychain session without an error. The temporary test app was removed and simulator shut down afterward. CI includes an unsigned native compile job; a hosted CI run is separate evidence.

Production dependency audit reports zero vulnerabilities; 17 moderate development/tooling advisories remain after compatible patches. Three known private configuration values were absent from 46 generated JavaScript files in a boolean-only scan. See [docs/REFACTOR.md](docs/REFACTOR.md) for scope. Real credentials/sign-in, Keychain token writes/restoration/deletion, real photo-library flows, live rules/API access, credential rotation, and TestFlight/production release remain unverified. The branch has been pushed and [draft PR #4](https://github.com/SleepyGinger/good-days-dashboard/pull/4) is open for review.
