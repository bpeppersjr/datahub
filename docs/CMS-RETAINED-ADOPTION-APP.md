# CMS hospital retained adoption

This app action inspects an already retained source run; it does not acquire or refresh a source. It is separate from admission into a national reporting release.

## Fixed contract

Authenticated `POST /api/data-operations/source-adoptions` accepts exactly `{"sourceId":"cms-hospital-general-information"}`. The managed service invokes `scripts/adopt-cms-hospitals.mjs --operation-id <allocated UUID>` with no caller paths, URLs, hashes, output choices, or native deadline override.

The only native input is `data/business-sources/cms-hospital-general-information/jobs/7140acea-6dfb-478e-8769-5dd991bc1875/manifest.json`, SHA-256 `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239`. The existing acquisition verifier checks its source chain and replays the retained normalization. The adoption builder adds only directory-row counts by reported state/territory, original source dates and acquisition clocks, and restrictive claims. Names, identifiers, full addresses and contact fields are not copied into this summary.

The new receipt is exclusively published under the allocated operation's `output/cms-hospital-adoption.json`. The managed parent independently replays verification and checks the operation binding before reporting success. Original source artifacts and receipts are unchanged. No raw or selected artifact is downloadable through this operation.

## Deadline and recovery

Native build and verify each have a fixed 180-second cooperative deadline. The standalone CLI inherits the build deadline. Managed execution uses one 180-second deadline shared across the child and subsequent parent verification, so these stages cannot each consume a fresh managed budget.

After cancellation/deadline, managed execution allows at most 35 seconds for child settlement (including the existing 30-second forced-termination grace), or one second for parent-verifier settlement. If work cannot be confirmed settled, the receipt remains `UNKNOWN`, with ownership retained and the global slot blocked. This is not proof of termination. Restart does not automatically repeat the action. Preserve outputs for inspection. An already published adoption receipt is not deleted or promoted to success after cancellation.

Native disk operations are cooperative; the deadline is not an operating-system guarantee against an uninterruptible filesystem call. Managed waiting is bounded and unresolved cleanup is explicitly withheld rather than reported complete.

## UI proof boundary

The card displays only a successful independently verified adoption's summary. Counts are hospital-directory rows, not unique businesses, campuses, current operators, physical-site verification or all-hospital completeness. State/DC and territory counts remain distinct. Source-issued, modified and released dates, original acquisition clocks, and the later adoption time are shown separately.

History reads do not replay source bytes. The UI labels the result as adoption-time evidence, not a fresh source check. Failed, cancelled, pending and unknown operations withhold success counts. The action is user-initiated and respects the shared managed-operation lock.

## Verification checkpoint — 2026-09-12 UTC

Implementation used the disclosed supported Astra fallback while Spark was unavailable. In the isolated app checkout, focused tests passed: 31 outer tests, including an isolated child suite with all eight source/lifecycle cases executed (no skips). Cases cover exact source replay, rehashed false claims/counts and drift rejection, operation binding, publication cancellation, actual short-timer expiry, noncooperative child/verifier ownership holds, restart, authenticated HTTP rejection, and UI metadata-only scope. Existing managed API export/download fixtures also passed with the new static import closure.

`npx tsc --noEmit`, owned-file ESLint, and `git diff --check` passed. No actual native adoption, desktop runtime validation, full combined check, new acquisition, production publication or deployment is claimed by this checkpoint. Those integration checks remain after root review and merge; the user's existing app was left running.

## Main integration acceptance — 2026-09-12 UTC

The later main acceptance supersedes the pending runtime portion of the checkpoint above. `stop-collector.bat` was executed successfully before runtime testing. One UI action created managed adoption `c6a20066-c2b7-4c9c-906e-eb85ab78b22f`, verified at `2026-09-12T14:43:50.965Z`. Its metadata receipt SHA-256 is `ade8191688046665ea795dd22c2679621872848b1e495f6ca6bce02d835c6ddb`. Result: 5,419 directory rows; 5,354 rows in states/DC; 65 territory rows; zero unresolved-state rows. The original source manifest hash remained unchanged. No acquisition or downloadable artifact was created.

The frozen executable baseline at `9f07397` passed `npm run check` with exit 0: 2,110 tests, 2,047 passed, 63 skipped, zero failed, followed by successful lint, web/desktop builds and desktop control-plane smoke. Log: `data/ui-verification/check-cms-adoption-final.log`. The default suite leaves optional retained-input cases gated; the new relevant gates were separately closed on main with no network:

- `DATAHUB_TEST_CMS_RETAINED=1` production-input test: 3/3 passed, no skips (`cms-native-production-pin.log`).
- CMS hospital and nursing-home optional registry admission, with both retained gates enabled and exact test-name filtering: 2/2 passed, no skips (`cms-native-admission-main.log`).
- Gated retained hospital coverage admission: parent and child tests both passed, no skips (`cms-native-coverage-main.log`).

Initial combined focused tests passed 115 with one native production-pin gate skipped; the separate 3/3 run above closes that gate. Dependency audit exited 0 with zero vulnerabilities (`cms-adoption-audit.log`). TypeScript exited 0.

After the full check, review requested a text-only clarification from geographic-sounding labels to explicit row counts. Only that UI wording and its tests changed. The full-suite claim applies to the pre-label executable baseline; final targeted proof consists of 3/3 label tests, TypeScript, owned ESLint, web/desktop build, and native UI reuse of the existing operation, all exit 0. No second adoption was dispatched. Logs: `cms-adoption-label-focused.log`, `cms-adoption-final-tsc.log`, `cms-adoption-label-build.log`, and `cms-adoption-label-native-ui.log`, all under `data/ui-verification`.

The native script verified authenticated operation history, operation-bound receipt, original hash, restrictive labels, 100% and 200% text layouts, and restart visibility. The final 100% screenshot explicitly includes the heading in the normal viewport (`cms-adoption-100.png`); `cms-adoption-200.png` records the enlarged layout.

Final restoration ran `stop-collector.bat` and `launch-datahub.bat`. The launcher remains attached to its live GUI child rather than having a terminal exit claim. Electron PID 26668 was created at `2026-09-12T14:55:36Z`, and `data/desktop.log` records the runner listening at `2026-09-12T14:55:36.607Z`. A separate final public `/api/health` check returned HTTP 200 and `{"ok":true}`. Authenticated history checks were performed during the preceding native acceptance/restart, not repeated against this final launch. The app remains open. No production plan/run, source download, next service slice, or deployment is included in this acceptance.
