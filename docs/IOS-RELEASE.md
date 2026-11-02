# iPhone release candidate 1.1 (2)

The website and protected analysis API are published from merged PR #4 (`af32f32`). Production CI passed, an authenticated synthetic analysis succeeded, and the published HTML/JavaScript passed credential scans. Analysis is restricted to the existing iPhone sign-in account.

## Prepared candidate

Version 1.1, build 2 has completed a signed Release archive using the existing developer identity and application identifier `org.dansalazar.gooddays`. Signature verification passed outside the macOS sandbox. Its 28 bundled web files contain none of the known old private configuration values; the complete app bundle also passed Gitleaks with only the exact public Firebase configuration value allowed. Bridge logging is disabled and the protected API endpoint is present.

This is a prepared archive, not an installed or TestFlight-distributed release. The last locally observed uploaded version is 1.0 (1). Check the actual installed version and latest App Store Connect build before choosing a distribution route or uploading.

## Device update

1. Connect the intended iPhone to the Mac, unlock it, and establish trust. Read its installed Good Days metadata. The paired iPhone 17 Pro is covered by the existing development profiles; no phone was reachable during preparation.
2. Preserve the app container, especially WebKit localStorage/IndexedDB records, when device access permits. Reconcile needed local-only journal entries with Firebase before any separate cleanup. Keep the current application identifier and team, and update in place; do not uninstall or clear storage.
3. Install the signed candidate using the established distribution route. A direct development install needs a reachable trusted device; a TestFlight upload additionally needs current App Store Connect numbering and distribution/cloud-signing access.
4. Complete the real-device acceptance checks in [REFACTOR.md](REFACTOR.md): login, Keychain restoration, journal persistence and visible failures, photos/permissions, themes, and authenticated analysis.

## Credential transition

The old password and provider key have not been rotated by preparing this archive. Complete the in-place update first so the installed client can accept a replacement password.

Create a dedicated replacement provider key in the Claude Console. Update only the server's `ANTHROPIC_API_KEY`, redeploy, and verify a synthetic analysis before disabling the old key. Anthropic's Admin API cannot create keys; never paste a key into chat or put it in a client build.

Store the replacement Firebase password securely before changing it through the authenticated account-update endpoint. Verify new-password login succeeds, old-password login fails, and the old refresh session fails. Password changes revoke refresh sessions; previously issued ID tokens may remain usable until expiry unless the receiving service checks revocation. Sign into the updated phone and verify session restoration afterward. Keep credential values, tokens, signing material, app containers, and archives out of Git and diagnostic output.
