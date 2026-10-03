# CMS retained directory ZIP evidence

This standalone `cms-retained-directory-zip-evidence@1.0.0` service derives separate
hospital and nursing-home directory counts from the two fixed retained selections.
It is `published-pre-production-evidence`, not national registry/coverage admission,
ten-source reporting enrollment, business identity reconciliation, or acquisition.
It never writes a current pointer or changes the existing eight-source denominator.

## Source and output contract

The exact selections are `config/cms-hospital-retained-selection.json` and
`config/cms-nursing-home-retained-selection.json`. Native publication and independent
verification invoke their existing source-replaying loaders. Manifest bindings
retain selection hashes, source manifest/selected-artifact identities, source dates,
observation/completion clocks, and distinct acquisition/recovery histories. Nursing
recovery explicitly retains failed run `ffb1fac4-4eb4-4ea4-b11c-875ebff4de41`, its
failure timestamp and `historical_failure_rewritten:false`.

Up to 100 two-digit ZIP buckets contain sorted unique ZIP entries. Each entry has
separate `hospital` and `nursing_home` directory-row counts and reported-state
counts. The national source-specific summaries conserve every row across state/DC,
territory, unknown-state, ZIP-present and missing-ZIP buckets. Missing-ZIP rows are
not assigned an invented ZIP. There is no cross-source business total. Publisher
ZIP/state labels are not verified geography. ZIP4 remains separate in retained
inputs and is neither joined nor grouped; the aggregate field is null.

No names, identifiers, street addresses, coordinates, or county assignments are
copied into the aggregate derivative. Counts describe dated directory rows only.
Business, physical-site, current-operation and completeness measures remain null;
geography/point eligibility and public export are false. Export is local-review-only.
A source count of zero within an existing ZIP means no rows from that retained
cohort, not no operating facilities. Absent ZIP evidence is not zero businesses or
an invalid-USPS finding. Source dates are not refreshed by the derivative clock.

## Interfaces and bounds

- `publishCmsRetainedDirectoryZipEvidence({createdAt, signal?})`
- `verifyCmsRetainedDirectoryZipEvidence(manifestPath, {signal?})`
- `readCmsRetainedDirectoryZipEvidence({zip5, signal?})`

Public APIs accept no alternate source, root, transport, validator, or output path.
The publisher/verifier reconstruct all aggregates from independently replayed native
inputs (each cohort at most 25,000 records). The lookup reads only fixed bounded
registration/source metadata, one manifest and one bucket, never the source rows.
Metadata is at most 100 KB per file, selections 10 KB, and each bucket 2 MB/1,000
ZIPs. Checksummed consumed bytes and final identity/hash rereads bind the selection.
Lookup does not reauthenticate raw sources or prove unrequested bucket contents.
The exact tracked manifest pin originates from full publication/verification;
arbitrary rehashed pins are not trusted.

Publication captures both selected JSONL files' consumed size, hash and filesystem
identity before the source loaders run, then streaming-rechecks them after replay,
before installation and after installation. A changed installed input leaves the
immutable release inspectable and rejects success. Independent verification also
rechecks these inputs before returning. Each selected file is capped at 40 MB;
the shared streaming reader enforces 64 KB lines and cancellation.

Bounded lookup validates closed ZIP/source schemas, nonnegative safe-integer
counts and per-source reported-state conservation. State-map keys are `missing`
or `reported:` followed by a bounded, control-free publisher label; they do not
assert geographic validity. HTTP validates a closed response envelope, unchanged
claims, registered identities/metadata, and presence/absence consistency before
responding, including responses from an injected reader.

The HTTP adapter `cmsRetainedDirectoryZipHttp` requires the existing full
Host/Origin/bearer authorization callback. Its exact empty GET accepts only one
`zip` parameter, rejects bodies/extra options, uses a 30-second cooperative deadline,
caps responses at 100 KB, disables caching and closes listeners on termination.
Missing/corrupt input returns unavailable; no fallback scan/build/network request
occurs. Server route wiring is owned by the integrator, not by this module.

## Publication and recovery

Owned staging files are exclusively created, synced and manifest-written-last;
full reconstruction precedes atomic release rename. Exclusive content-ID locks
serialize installation; exact existing releases are verified and reused. Closed
inventories and app-contained canonical single-link paths reject extras/aliases.
Cancellation removes only owned staging before installation; after installation
the release is preserved with inspection-required metadata. Lock cleanup failure
preserves the primary error and reports recovery state. Crash-held locks are not
automatically reclaimed. Filesystem checks are not an OS-level guarantee against
a privileged adversarial writer racing every syscall.

```powershell
npm run cms:retained-directory-zip:build -- --created-at 2026-10-02T22:30:00.000Z
npm run cms:retained-directory-zip:verify -- data/cms-retained-directory-zip-evidence/releases/<release-id>/manifest.json
node --test runner/cms-retained-directory-zip-evidence.test.mjs runner/cms-retained-directory-zip-http.test.mjs
```

## Native evidence

Offline publication and a separate independent verification succeeded for
`cms-retained-directory-zip-evidence-87064e0f512a859e6244e7123858dae862dad4b002290a05b97581998feb9e40`.
Manifest SHA-256:
`0cebe0585c5eadeef1fd8755ddb71d54927e01b64f76c37e8d7096381ebeec99`.
Build clock: `2026-10-02T22:30:00.000Z`. It indexes 9,997 reported ZIP labels.

| Source | Directory rows | States/DC | Territories | Missing ZIP/state |
|---|---:|---:|---:|---:|
| Hospital | 5,419 | 5,354 | 65 | 0 / 0 |
| Nursing home | 14,690 | 14,680 | 10 | 0 / 0 |

`config/datasets/cms-retained-directory-zip-evidence.json` pins this release's exact
manifest, ordered inventory digest, counts and unchanged claims. Publication made
zero network requests and changed no current pointer or production enrollment.
Focused tests exercise source reconstruction, rehashed tamper, missing-state/ZIP
conservation, ZIP4 separation, duplicate rejection, links, cancellation, concurrent
owners, lock recovery, bounded native lookup, authorization and deadline behavior.
Full repository/runtime checks remain the integrator's release gate.
