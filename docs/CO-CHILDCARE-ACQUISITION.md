# Colorado bounded center acquisition

The acquisition engine and immutable release reader implement the [selected-delivery contract](states/CO-CHILDCARE-SELECTED-DELIVERY-2026-09-08.md) for the exact CDEC `Child Care Center` category. Other categories, contact/governing-body fields, quality-rating fields and coordinates are excluded. This implementation does not yet enroll a standalone industry worker or perform a full native download.

## Acquisition contract

Two complete six-request preflights bracket three fixed ordered traversals: baseline license IDs, nine-field selected records, final license IDs. Each traversal uses 500-row GET pages with explicit `provider_id ASC` ordering and bounded numeric offsets, reconciles the expected count and ends with an empty terminal page. IDs are canonical positive integer strings of at most 32 digits, compared with integer precision rather than floating-point conversion or lexical order. Selected records must match baseline order and membership; final IDs must agree. These comparisons detect observed drift, not an atomic publisher snapshot or verified business identity.

Preserve optional strings, nulls and omissions. Reconcile nonnull street/ZIP/state counts to the preflight, including blank strings as nonnull. Do not reinterpret malformed capacity or postal text as valid values; retain it for normalization quality handling. Physical-address semantics are application-reported, not independently verified premises. Raw ZIP text is source evidence; canonical ZIP5 and ZIP4 remain separate in the subsequent normalization contract.

Limits: 20,000 source rows, 135 requests, 150 million cumulative decoded body bytes, eight million bytes per selected page, two million per other response, 30 seconds per request, 15-minute cooperative overall deadline, and one-second serial pacing. Preflight bodies, partial reads and terminal pages count against budgets. No retries, redirect fallback, account flow, proxy rotation or automatic resume is supported.

## Retained release

Persist the prerequisite before requesting rosters and each validated observation before advancing. A release uses an exclusive root lock, a 500-million-byte observed free-disk floor, UUID directories and manifest-last immutable publication. Ordinary failures preserve inspection journals; cancellation removes only owned incomplete artifacts. Ambiguous committed publication is retained for inspection, never erased to force a retry. A successful release can be replayed offline without another source request.

```powershell
node scripts/verify-co-childcare-acquired.mjs --manifest <absolute-acquired-manifest>
```

The reader verifies exact artifact roster, paths, hashes, chronology, configuration and complete semantic replay. A raw HTTP hash is not independent source attestation. Returned claims keep current operations, exact geocodes, physical-site verification, identity matching, national integration and public export unverified. The PDDL designation permits reuse of covered rights; internal-only output here describes the implemented field-handling scope, not a newly invented licensing restriction.

Next: normalize source candidates with explicit quality/provenance and split postal fields, then implement standalone app lifecycle and handoff. Reuse any complete verified release if one exists; never treat partial journals as complete acquisition or repull retained data merely for promotion. Rollback disables future invocation while keeping immutable history; no production source pointer or national plan is modified by this connector.

## Implementation verification — September 8, 2026

The full repository check passed: 1,356 tests, 1,345 passed, 11 skipped and zero failures, followed by lint, builds and desktop control-plane smoke. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending production pins remained unchanged. Local check log: `data/tmp/co-childcare-acquisition-full-check.log`.

Synthetic tests cover multi-page integer-ID membership, sparse selected fields, replay tampering, durable callbacks, cancellation, publication uncertainty and nested immutable-output rejection. The existing shared output-path guard already rejects manifest-bearing ancestors; the new regression confirms it preserves the prior directory roster and manifest. These checks do not constitute a native full acquisition or standalone app enrollment.
