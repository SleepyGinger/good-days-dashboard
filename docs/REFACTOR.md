# Good Days refactor and release guide

Prepared November 1, 2026 on `codex/good-days-refactor`, reviewed in [PR #4](https://github.com/SleepyGinger/good-days-dashboard/pull/4). Website publication is approved, with protected analysis restricted to the existing iPhone sign-in account. Local integration results and remaining native release requirements are recorded below; production completion needs live deployment evidence.

## Scope and intent

Good Days is used mostly on iPhone. The refactor keeps the familiar journal, calendar, themes, photos, and recent mood summary while giving native sessions, persistence, photos, and analysis explicit boundaries. It retains Next.js static export, Firebase, Capacitor, and the shared household data model.

Next.js and its ESLint configuration are pinned to 15.5.28 in the maintained Next.js 15 line. Node.js 22 or later is required. The version choice follows the [October 14, 2026 Next.js security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026); recheck [maintainer security updates](https://nextjs.org/blog/security) when releasing. GitHub Pages serves exported files and does not run a request-time Next.js server.

The work was delegated across auth/data, photo/UI, and sentiment/API modules and cross-reviewed before integration. Cross-review identified and addressed an initialization retry race that could overwrite a new native sign-in, and added bounded REST requests. Final validation must still exercise the assembled application.

## Architecture

| Boundary | Responsibility |
| --- | --- |
| `GoodDaysDashboard` | Composes authenticated dashboard views. A user change remounts the private dashboard state. |
| `EntryEditor`, `EntryViewer`, `MoodCalendar`, `ThemeDrawer`, photo components | Present and edit a focused part of the journal. Save failures keep the draft; successful writes trigger celebration. |
| `domain.ts`, `dates.ts` | Shared entry/theme/analysis types, legacy photo access, and local calendar-day helpers. |
| `firebaseClient.ts`, `sharedInitialization.ts` | Share Firebase initialization and allow retry after initialization failures. |
| `authService.ts`, `nativeSession.ts` | Browser Google auth; native Firebase REST sign-in/refresh; generation guards for changed sessions; fresh ID tokens for protected requests. |
| `nativeSessionPlugin.ts`, `SessionPlugin.swift` | Store only the native refresh token in iOS Keychain. The password and active ID token are not persisted by this bridge. |
| `dataService.ts`, `cloudDataClient.ts`, `dataRecords.ts`, `dataSubscriptions.ts`, `network.ts` | Validate persisted records, preserve Firebase paths, use browser collection listeners/native polling and bounded REST mutations on both platforms, clean up stale subscriptions, and surface cloud errors. |
| `useDayPhotos`, `useEntryPhotos`, `photoUploadCoordinator.ts`, `PhotoDayPlugin.swift` | Date-scoped device browsing, permission states, pagination, upload limits, stale-work cancellation, and temporary-file cleanup. |
| `sentiment-client.ts`, `vercel-api/lib/`, `SentimentSummary` | One authenticated API contract and server prompt/parser; validate results before displaying/saving them. |

There is one `next.config.js`. Both the custom web domain and Capacitor use assets at their root. The static-export-incompatible Next POST route and duplicate configuration have been removed. Anthropic REST calls occur in the standalone Vercel API.

The iOS scheme is explicitly `capacitor`, giving the native origin `capacitor://localhost`. Installed Capacitor 8's `CAPInstanceDescriptor.swift` lines 166–175 reject schemes handled by WKWebView, including the prior `https` setting, and normalize them to the default `capacitor` scheme. The explicit configuration preserves that normalized origin. The API also permits `https://localhost` for Android/older clients. Real-device verification remains necessary.

## Preserved data and recovery

The database still uses shared roots:

```text
moodData/{YYYYMMDD}
themes/{id}
sentimentData/{key}
```

Recent analysis reads/writes the existing `sentimentData/last60` record. Other saved analysis records are left in place. There is no migration to user-specific journal roots, automatic rewriting of historical records, or deletion of cloud data. Photo Storage paths continue to include the uploading user's ID.

Existing entry date/day/energy/touch/note fields remain supported. `getEntryPhotos()` reads both legacy `photoUrl` and current `photoUrls[]`. Local calendar dates remain local dates; converting their keys through UTC would change behavior.

The new persistence service does not silently fall back to localStorage after a Firebase failure. A failed write remains a failed write, with the draft available to retry. Both platforms use bounded REST mutations instead of an offline SDK write queue. New themes have stable draft IDs so retrying a write targets the same record.

Previously saved localStorage records under `moodData`, `themes`, and `sentimentData` are left intact for manual recovery. Before any separate cleanup, export the old browser/WebView local records, compare them with Firebase, and import only explicitly reconciled missing data. Do not clear browser storage or uninstall the old iPhone app until any needed local-only records have been recovered.

## Configuration

Client build inputs are public Firebase project configuration and `NEXT_PUBLIC_SENTIMENT_API_URL`. Use `.env.example` as the current client template. Firebase public project configuration is intentionally included in the client; live database/Storage rules enforce access to the household data.

Existing `.env.local` files and CI/native build settings may contain old `NEXT_PUBLIC_ANTHROPIC_API_KEY` or `NEXT_PUBLIC_IOS_AUTH_*` values. Remove these deprecated entries before any build. The prebuild guard rejects unsafe public credential variable names. Native sign-in no longer reads embedded account credentials, and analysis no longer reads a client Anthropic key. Do not print old environment values or include them in a commit.

The Vercel API needs these server settings:

| Setting | Requirement |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required server-only provider credential. |
| `FIREBASE_WEB_API_KEY` | Required key for the intended Firebase project's token/account lookup. |
| `GOOD_DAYS_ALLOWED_EMAILS` | Required comma-separated intended household accounts; empty configuration fails closed. |
| `GOOD_DAYS_ALLOWED_ORIGINS` | Optional exact origin list; defaults to `https://gooddays.dansalazar.org`. The iOS `capacitor://localhost` origin is permitted, along with `https://localhost` for Android/older clients. HTTP loopback is limited to development. |
| `ANTHROPIC_MODEL` | Optional compatible model override. The default is `claude-haiku-5-5`, verified supported in [Anthropic's official model documentation](https://platform.claude.com/docs/en/models/haiku-5-5/overview) on November 1, 2026. |

The API verifies the Firebase bearer token and household email allowlist before sending notes to Anthropic. It accepts user-supplied notes, not a database key that retrieves arbitrary journal records. Native email/password accounts may have `emailVerified=false`; the server intentionally relies on the explicit existing-account allowlist after Firebase validation. Configure the list carefully and verify the intended accounts before release.

See [the API README](../vercel-api/README.md) for bounds, timeout behavior, standalone setup, and model override compatibility. Six requests per ten minutes and one concurrent analysis are enforced per user in a warm function instance. These counters do not persist or coordinate across instances. Provider/account spend controls are needed for a durable cost ceiling.

## Verification commands

Install both dependency trees from their lockfiles with Node.js 22 or later:

```bash
npm ci
npm ci --prefix vercel-api
```

Run the assembled checks and both export paths:

```bash
npm test
npm run typecheck
npm run lint
npm run check
npm run build
npm run build:ios
npm run cap:sync
```

`check` includes app/API TypeScript, lint, mocked tests, and `test:api-runtime`. The runtime check compiles the standalone API with its actual package metadata and checks emitted JavaScript over a temporary loopback HTTP server. API NodeNext resolution, explicit ESM package type, and `.js` relative imports match the deployed Node.js 22.x runtime; bundler-only resolution previously hid a production startup failure. Tests cover date/record contracts, shared initialization, native token renewal/logout races, polling cleanup, network timeouts, photo upload coordination, and sentiment authorization/validation. Tests do not use production credentials or send journal notes to a model.

Each export writes `out/`; run the appropriate build immediately before using its output. A browser preview can use:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory out
```

With that server running in another terminal, run the browser smoke checks:

```bash
npx playwright install chromium
npm run test:browser
```

The browser script permits only a local server and intercepts provider/native calls with isolated synthetic fixtures. It checks application workflows without production writes and saves screenshots to a temporary output directory. `GOOD_DAYS_TEST_URL` can select another local URL; the default is `http://127.0.0.1:4173`.

Open `http://127.0.0.1:4173` in an iPhone-sized viewport for manual review. For browser development use `npm run dev` and `http://localhost:3000`. Check sign-in/error presentation, keyboard/navigation, layout at narrow widths, calendar/date changes, drawers, photo lightboxes, themes, and visible retry behavior. A mocked browser smoke test does not validate real Firebase authentication or actual native bridges.

After `npm run build:ios` and `npm run cap:sync`, compile for the simulator without signing:

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme 'Good Days' \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -packageAuthorizationProvider netrc \
  -derivedDataPath /tmp/good-days-native-check \
  CODE_SIGNING_ALLOWED=NO \
  build
```

This requires Xcode and its selected command-line tools. `-packageAuthorizationProvider netrc` avoids a Keychain credential lookup that blocked public SwiftPM binary downloads during the initial local attempt; the successful compile used this supported Xcode flag. Compilation establishes that the native project builds; it does not prove Keychain persistence, Firebase access, or photo-library behavior on the actual phone. `npm run deploy:ios` additionally archives/exports with signing and is a release command, not the routine verification command.

## Staged rollout

1. Keep the work on its branch and open a PR with the actual validation results. The workflow checks PRs with Node 22, both dependency trees, `npm run check`, a static build, isolated browser smoke checks, and a separate macOS unsigned simulator compile job. Pages deployment requires both jobs and is conditional on a push to `main`. A hosted CI run still needs its own outcome; branch/PR creation does not publish the app. Review source changes and confirm native Swift/Xcode source is included while generated bundles/caches, archives, signing material, and environment files are excluded.
2. Recover any needed local-only browser/WebView records before replacing or uninstalling existing builds. Confirm the Firebase journal and legacy photos remain readable without a schema migration.
3. Review current Firebase Authentication settings and database/Storage rules for the intended household accounts. Configure the API's server credential, Firebase project key, household allowlist, allowed origins, supported model, and provider cost controls.
4. Deploy the protected Vercel API before releasing the new clients. Prefer a preview/new endpoint for staged verification, then build the candidate web/native clients with that endpoint. Old clients lacking a bearer token cannot call the protected endpoint; replacing the existing endpoint immediately interrupts their analysis until they update. Existing direct-provider clients also need to transition away from the retired `claude-sonnet-4-20250514` path.
5. Validate an allowed and denied account, a real authenticated analysis, successful journal/photo persistence, and visible failures in the candidate. Complete the real-iPhone checks below. The original production deployment and live settings have not been established by source inspection or mocks.
6. Release the web client through the reviewed `main` change and the Pages workflow, and distribute/install the new signed iPhone build through the existing app release process. The API and native app are separate deployments; publishing web assets does not update an already installed iPhone app.
7. After replacing the old installed builds, rotate the formerly embedded Anthropic credential and Firebase account password, update the API host to use the replacement provider credential, revoke old Firebase sessions, and sign back in on the new app. Remove obsolete build/environment entries. Source changes cannot erase credentials from old installed bundles. Credential rotation and session revocation are separate live operations and have not been performed by this refactor.

Keep a recoverable copy of the prior source/build and reconcile data before rollback. Do not restore deprecated embedded credentials as a rollback strategy.

## Real-iPhone acceptance

- Sign in with the intended existing Firebase email/password, quit/reopen, and confirm the Keychain-backed session restores. Exercise token renewal and sign out/reopen to confirm private data and the saved session are cleared from the app session.
- Load current/historical entries, open a legacy single-photo entry, edit/save, and confirm it persists after reopening. Confirm an interrupted/denied write keeps the draft and shows an error.
- Exercise full, limited, and denied photo permissions; browse a date with many photos and load another page. Open the gallery, select up to three photos, upload, save, reopen, and inspect full images. Cancel or change dates while photos are loading/uploading and confirm old results do not enter a new draft.
- Open/create/edit/delete themes and check calendar theme rings at narrow widths and across local-day boundaries.
- Analyze recent notes through the protected API, reopen the saved result, and confirm auth/permission/provider failures show a usable error. Sign out during outstanding reads and confirm a late result cannot reveal the previous dashboard.

## Integration results

Observed locally during integration on November 1, 2026:

| Check | Result and scope |
| --- | --- |
| Node regression tests | 49 passed. Provider/auth/native calls are mocked; pure lifecycle and record/date behavior are exercised. |
| App/API TypeScript and ESLint | Passed cleanly. |
| Web export, iOS export, Capacitor sync | Passed. |
| Native simulator compilation | Unsigned and normal ad-hoc simulator builds succeeded with Xcode 26.5. The public-package download check used the `netrc` authorization flag. |
| Browser workflows | Eight groups passed with isolated synthetic provider/native fixtures, including the footer-error viewport assertion. Updated screenshots were visually reviewed. |
| Native launch smoke | The normal ad-hoc simulator build launched the actual native email/password UI. The Session bridge executed `SecItemCopyMatching` for an empty saved session without a Keychain error. The test app was removed and simulator shut down afterward. |
| Production dependency audit | Zero reported vulnerabilities after compatible dependency patches. |
| Development/tooling dependency audit | 17 moderate advisories remain. No forced major upgrades were applied. |
| Known credential values in generated assets | None of the three previously configured private values were found in 46 generated web/native JavaScript files. This used boolean-only comparisons without printing the values. |
| Hosted CI | App/API/browser and unsigned native compile jobs are configured; a remote run has not been established by these local results. |

The launch check covers startup and reading an empty Keychain session. It does not exercise real credentials, a successful sign-in, refresh-token writes/restoration/deletion, or the actual photo-library bridge workflow. The temporary simulator app has been removed.

The initial hosted app/browser and native jobs passed at commit `921bd9c`. A production web/API/iOS deployment or TestFlight distribution; live Firebase rule enforcement; credential rotation or session revocation; authenticated production analysis; and real-device Keychain, renewal, permissions, photo upload, and recovery behavior remain separate checks.

## Pre-publication credential review

The final security pass removes `.claude/settings.local.json` from tracking and ignores it. An existing uncommitted local permission rule contained a provider credential; that modification was never included in the branch or reachable Git history. Preserve local settings privately and never stage tool permission files containing shell commands or credentials.

Capacitor bridge logging is explicitly disabled in every build because plugin results include Keychain refresh tokens. The analysis client requires HTTPS, rejects embedded URL credentials and redirects before transmitting a bearer token, and permits HTTP loopback only during local development. Two additional regression tests cover these transport restrictions (51 total tests).

Gitleaks 8.30.1 scanned reachable history, the complete tracked source snapshot, and web/native export trees. Its only initial matches were the public Firebase web API key. `.gitleaks.toml` permits that exact public value; all other default rules remain enabled. CI verifies the pinned scanner archive checksum, scans Git history before building, and scans exported assets before publication. Scanner output must remain fully redacted.

The prior live website's root HTML and 12 loaded JavaScript assets contained none of the three distinct previously configured private values and no private-credential patterns. Its separate `/dashboard/` route returned 404; authenticated pages, historical deployments, and installed iOS bundles were outside this live scan. This check does not establish rotation or erase credentials from old installed clients.
