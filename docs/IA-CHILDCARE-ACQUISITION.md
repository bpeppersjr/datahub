# Iowa selected center/preschool acquisition

## Implemented boundary

The collection layer follows the [verified schema prerequisite](IA-CHILDCARE-SCHEMA-PROBE.md) and [publisher scope review](states/IA-CHILDCARE-SCOPE-FOLLOWUP-2026-09-08.md). It is not an active-business census. `businessType === "building"` selects the public center/preschool display class; home providers and unselected fields are discarded before writing source-layer evidence.

The internal source policy permits this user-requested bounded source-layer collection. It does not assert a public-domain license, legal approval, accepted agreement or public export authorization. Public export remains a separate review. Unknown source update times and operating status are preserved as gaps, not inferred from vacancies or referral eligibility.

Selected source fields are exactly `businessType`, `businessName`, `address`, `city`, `zipCode`, `latitude`, `longitude`, and `referral`. Missing values are explicit nulls. Numeric ZIPs remain source-native numbers in acquisition; normalization must later validate them into separate ZIP5 and ZIP4 fields without padding an invalid value or fabricating an extension. Names/addresses are bounded strings; noncanonical negative zero and unexpected selected types fail closed. No state field, operating dates, geometry, provider identity or coordinate accuracy is invented.

Each selected row preserves its original one-based position in the mixed response. That ordinal belongs only to one release, not a stable provider ID. Identical rows are retained and counted, not silently deduplicated. Selected plus excluded counts conserve the observed response. Offline replay verifies selected evidence consistency; it cannot independently reconstruct excluded mixed rows or the full-response bytes, which are deliberately not retained.

## Runtime and retention

`runner/ia-childcare-acquisition.mjs` makes three serial fixed requests: pinned client GET, empty-form pins POST, pinned client GET. It checks current connector/policy fingerprints before acquisition and after the final client. Limits: 20 seconds per request, 120 seconds for cooperative acquisition, 1 MB client, 10 MB decoded pins response, 10,000 rows and 5 MB selected serialization. Unexpected client changes, redirects, access denial, malformed data or exceeded limits stop the run without retry.

`runner/ia-childcare-acquired.mjs` adds fixed app-contained output, a publisher exclusion lock, 128 MB disk-headroom check, unique release IDs, fsynced checkpoints before subsequent requests, checksummed evidence, and manifest-last no-overwrite publication. `verifyIaChildcareAcquired` replays the selection and compares every declared checkpoint, hash and directory roster offline. Test-transport releases are confined to `data/tmp/ia-childcare-acquired-test`; native releases belong under `data/business-sources/ia-childcare/acquired`. A synthetic receipt cannot be relabelled native merely by moving it.

Cooperative cancellation aborts response reading and drains in-flight checkpoint work. Owned incomplete files are removed; uncertain ownership and committed evidence are preserved for inspection. A process crash can leave a publisher lock that requires inspection; automatic lock recovery and retries are not implemented. The acquisition deadline is cooperative for checkpoint work, which is awaited rather than abandoned while still writing. Available RAM does not increase the provider request budget.

## Verification and remaining work

Twenty-four focused tests passed across selection, acquisition, durable retention, registry and control-plane integration. They exercise selected-only privacy, duplicates, typed limits, caller mutation, invalid replay, access denial, cancellation during reads/checkpoints, checkpoint-before-next-request ordering, overlap exclusion, tampered artifacts and preserved release verification. Full `npm run check` passed: 1,469 tests, 1,458 passed, 11 skipped, zero failed, followed by passing lint, desktop build and desktop control-plane smoke. The log is `data/tmp/ia-acquisition-full-check.log`. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 held production-plan pins remain unchanged.

No native facility collection, normalized release, managed app operation, recurring schedule, or national promotion was dispatched by this increment. The previous schema response was discarded under its narrower policy; it is not an acquired release to reuse. Next implement normalization and app-worker lifecycle/enrollment, then hand the first collection to Co*Tive with a persisted operation ID. After acquisition, downstream promotion/reprocessing must reuse verified retained evidence rather than fetch again.

Rollback removes the isolated acquisition/selection modules and registry configuration without rewriting previous schema receipts or other retained datasets. Preserve any future acquired releases as historical source evidence.
