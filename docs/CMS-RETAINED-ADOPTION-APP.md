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
