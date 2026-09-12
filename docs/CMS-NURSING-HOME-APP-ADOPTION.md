# Retained CMS nursing-home adoption handoff

Implementation prepared September 12, 2026 in the isolated app checkout based on published `f7f28e1`. The dedicated implementation/testing agent is the disclosed Astra fallback while Spark is unavailable.

## Scope and fixed evidence

This is a second fixed **retained source adoption**, not an acquisition, refresh, recovery rerun, production publication, or download feature. It shares the hospital adoption's authenticated `POST /api/data-operations/source-adoptions`, global operation slot, durable history and restart behavior. The closed request is `{ "sourceId": "cms-nursing-home-provider-information" }`; paths, source versions and output destinations cannot be supplied by callers.

The native adapter selects only `data/business-sources/cms-nursing-home-provider-information/recoveries/9fe3aa54-dd38-42be-b28e-b1d363300a45/manifest.json`, SHA-256 `89ee608067aa5b97833957b753be61003dc2efcfa22cfaedbb3b78f020396d7e`. It invokes the existing full recovery verifier, including the pinned original failed acquisition and selected artifact. The original acquisition `ffb1fac4-4eb4-4ea4-b11c-875ebff4de41` remains **FAILED**; its failure receipt hash is `1cece3c9e809fc8ffa4bc271ee5472f62c66a1a2780825511f474c557132d1a7`. No historical receipt is rewritten.

Previously verified retained totals are 14,690 publisher nursing-home directory rows: 14,680 rows reported in the 50 states/DC and 10 territory rows. Those are not unique businesses, geographic-unit counts, current-operation certifications or completeness percentages. This isolated implementation has not performed a native adoption or independently reproduced those native totals; the app shows counts only after its managed verification succeeds.

## Lifecycle and policy

`scripts/adopt-cms-nursing-homes.mjs` accepts only `--operation-id UUID`. It writes an operation-bound, metadata-only `output/cms-nursing-home-adoption.json` under the managed operation. The parent independently verifies the output, source binding, original failure identity, chronology, source hashes and counts before success. Source rows, contacts and raw artifacts are not copied into the receipt or offered for download. Managed output policy is internal metadata-only; underlying selected evidence remains local-review-only and raw evidence internal. Public export remains unauthorized.

The fixed 180-second adoption budget covers the managed child plus independent verification. Standalone build/verify also have a fixed 180-second deadline. Managed cancellation drains the child for at most 35 seconds and a verifier for at most one second; an uncooperative stage becomes UNKNOWN with ownership retained rather than allowing another operation. Publication followed by interruption retains an inspection descriptor. Restart never automatically retries. Synthetic timing and source overrides are separate test-only entry points, not CLI/API options.

The separate nursing card preserves the original failed-run identity and acquisition/failure clocks, recovery identity/clock, and adoption verification clock. Failed, cancelled or unknown operations expose no verified count summary. Hospital behavior remains available through its existing source ID and default card. This slice does not alter source recovery, registry/coverage inputs, production plans, catalog publication or source access holds.

## Isolated verification boundary

Focused command:

```powershell
node --test runner/cms-nursing-home-adoption.test.mjs runner/cms-hospital-adoption.test.mjs runner/cms-hospital-adoption-ui.test.mjs runner/managed-api.test.mjs runner/managed-operations.test.mjs
```

Result: 31 parent/top-level tests passed, zero failed or skipped. The isolated lifecycle wrappers additionally enforce seven nursing and eight hospital child tests, all executed. Evidence: `data/tmp/nursing-adoption-focused.log` in the isolated checkout. Cases include rehashed claims/counts/clock drift, source drift, wrong operation/source/failure binding, duplicate exclusion, pre-publication cancellation, post-publication timeout inspection, cooperative verifier cancellation, uncooperative verifier UNKNOWN hold, restart visibility, no artifact download and authenticated closed-input handling. UI assertions distinguish nursing rows from geography and preserve FAILED history.

`npx tsc --noEmit`, targeted ESLint and `git diff --check` passed. `npm audit --omit=dev` reported zero vulnerabilities (`data/tmp/nursing-adoption-audit.log`).

No native source requests, native adoption, main-app restart, screenshots or full integration check were performed in this isolated slice. After review/integration, the app owner must coordinate stop-before-runtime, one native retained-only adoption, authenticated UI/history validation, final combined check and relaunch. Keep the currently running main app and production plan untouched until that boundary.
