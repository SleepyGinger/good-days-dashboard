# Review Findings

## Typo Fix Task
- **Issue**: The inline comment above the main layout in `GoodDaysDashboard` uses the British spelling "centre," which is inconsistent with the rest of the codebase that follows American English conventions (e.g., "color").【F:src/components/GoodDaysDashboard.tsx†L292-L377】
- **Proposed Task**: Update the comment to use "center" for consistency.

## Bug Fix Task
- **Issue**: Both `subscribeEntries` and `subscribeThemes` store the unsubscribe function returned by Firebase's `onValue`, but their cleanup closures call `off` with that function instead of invoking it. This leaves the real listener active, causing duplicate subscriptions and memory leaks on re-renders.【F:src/components/GoodDaysDashboard.tsx†L120-L174】
- **Proposed Task**: Change the cleanups to call the `unsub()` function (and mirror the fix in both subscribers) so listeners are actually removed.

## Documentation Discrepancy Task
- **Issue**: The README still instructs contributors to edit `app/page.tsx`, but in this repo the App Router lives under `src/app/page.tsx`, so the documented path is stale.【F:README.md†L19-L21】【F:src/app/page.tsx†L1-L78】
- **Proposed Task**: Update the README to reference `src/app/page.tsx` (and consider mentioning the dashboard entry point at `src/app/dashboard/page.tsx`).

## Test Improvement Task
- **Issue**: Analytics helpers like `longestStreak`, `goodDayRate`, and the theme ribbon `packThemes` routine drive user-facing stats and layout but currently have no automated coverage, leaving regressions undetected.【F:src/components/GoodDaysDashboard.tsx†L346-L379】【F:src/components/GoodDaysDashboard.tsx†L586-L695】
- **Proposed Task**: Introduce unit tests (e.g., with Vitest or Jest) that exercise these helpers across edge cases such as gaps in dates, zero good days, open-ended themes, and row-cap limits.
