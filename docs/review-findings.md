# Refactor assessment and current findings

This replaces the older review note, whose file locations and several claims no longer described the current source. It records the November 1, 2026 assessment and resulting scope. Final integration outcomes belong in [REFACTOR.md](REFACTOR.md).

## Why targeted refactoring was warranted

| Finding in the assessed source | Resulting change |
| --- | --- |
| The dashboard combined Firebase initialization/authentication, REST and localStorage persistence, photos, sentiment requests, calendar, and editing state. | Extracted typed services, lifecycle hooks, and focused UI components. |
| Native credentials and a direct Anthropic client path could be built into client assets; the Vercel endpoint did not authenticate household users. | Native login accepts user-entered credentials and keeps a refresh token in Keychain. All clients use a bearer-authenticated API with an explicit server household allowlist. A build guard rejects unsafe public credential variables. |
| Three sentiment implementations differed and requested a retired model. | One prompt/parser and a configurable supported server model; removed the Next POST route that a static export cannot host. |
| Cloud errors could be swallowed or presented as successful local fallback writes. | Cloud errors surface, drafts stay available on failed saves, and localStorage is no longer an automatic success path. Existing local records are retained. |
| Native custom source lived under a completely ignored `ios/` directory. | Preserve native Swift/Xcode source while ignoring generated bundles and build/signing outputs. |
| Two Next configs disagreed; lint was skipped and important logic lacked automated coverage. | One root config, Next 15.5.28 with matching lint configuration, Node 22+, explicit app/API TypeScript and lint checks, and mocked behavioral tests. |
| Long-running photo/auth/data work could return after a draft or session changed. | Generation guards, explicit cleanup, serialized token-store operations, bounded REST requests, and photo-upload coordination. |

The existing Firebase schema, household sharing, legacy photos, and static hosting remain. This is an incremental refactor without a database migration or framework replacement.

## Checks still required for release

- Replace the installed iPhone build and verify one-time email/password login, Keychain restoration, token renewal, and logout on the device.
- Exercise native photo access with full, limited, and denied permissions; browse a populated date, paginate, select/upload up to three photos, save, reopen, and cancel/change dates during asynchronous work.
- Verify the configured API against a real allowed Firebase account and a denied account; confirm the deployed household allowlist, allowed origin, model availability, and provider cost controls.
- Review live Firebase database and Storage rules for the intended household accounts. Repository code does not establish the deployed rules.
- Inspect/export old localStorage records for manual recovery before any separate cleanup. No automatic migration or deletion has been performed.
- Remove deprecated public credential environment entries before building; replace existing clients, then rotate formerly embedded provider/Firebase credentials and revoke old sessions.

## Verification

Local integration verification passed 49 regression tests, app/API TypeScript, ESLint, both static exports, Capacitor sync, unsigned Xcode 26.5 simulator compilation, and eight browser workflow groups using mocked providers. Screenshots were visually reviewed. The final footer/error-viewport recheck and native launch smoke check are still in progress.

The production dependency audit reports zero vulnerabilities. Seventeen moderate development/tooling advisories remain after compatible patches; no forced major upgrades were applied. A boolean-only scan found none of the three previously configured private values in 46 generated web/native JavaScript files.

The iOS scheme is now explicitly `capacitor`. Installed Capacitor 8 source already normalizes the prior unsupported `https` setting to that default, so this makes the normalized origin explicit. The API permits `capacitor://localhost` and retains `https://localhost` compatibility.

CI includes unsigned native compilation alongside app/API checks, exports, and mocked browser smoke checks. Local results do not establish successful production deployment, credential rotation, live rule enforcement, or real-device operation. See the [release guide](REFACTOR.md) for commands, rollout order, and the remaining acceptance checks.
