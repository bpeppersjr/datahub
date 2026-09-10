# Overture source-to-output fidelity audit

Inspected implementation: `1d1b04e`. This is an investigation result, not a completed managed normalizer or a production dataset release.

## Reproduced defect

A local one-record synthetic snapshot was built with the default retained-only mode. Its source name was `Original synthetic business`. The normalized `names.primary_name` was changed to `Altered synthetic business`; the normalized gzip's byte count and SHA-256 were recomputed in its manifest. `verifyOvertureUsPlaces` accepted that altered release. The retained selected source was not changed.

Reproduction script: `data/tmp/overture-fidelity-probe.mjs`. Successful evidence: `data/tmp/overture-fidelity-probes/83c91425-b1cd-4b9b-bf25-b2cb2a098821/evidence.json`. All files are private synthetic fixtures under datahub; no current pointer was written, no production records were used, and no download was made. The initial probe lacked required source provenance and correctly failed the quality gate; the corrected probe includes synthetic provider provenance.

This proves a specific semantic mismatch can pass checksum/count verification. It does not prove existing production data has been altered. Adding only a name-format check would not fix the cause: valid-looking addresses, categories, status, brand, coordinates and provenance also require comparison with their retained source and transformation context.

## Handoff contract findings

| Evidence | Current behavior | Required integration |
|---|---|---|
| `overture-acquisition-receipt.mjs` | Verifies acquisition descriptor, native/test mode, selected hash/projection, plan, prerequisite references, journal accounting and inventory. Explicitly returns `native_source_replayed: false`. | Admit only a successfully verified native receipt selected through an app operation; do not reinterpret structural verification as replay of remote Parquet. |
| `overture-us-places.mjs`, `copyPreparedSource` | Accepts independent metadata and gzip paths; hashes before copying, uses an unbounded metadata read and ordinary copy. | Consume the verified selected artifact directly through a bounded, cancellable, identity-checked retained copy. Preserve the original acquisition reference, not fabricated legacy metadata. |
| `loadZbpBaseline` | Reads a mutable current pointer, manifest and coverage file; validates coverage hash but not the full baseline release. | Resolve once to a pinned, independently verified baseline release; bound intake and retain the exact baseline needed for replay. |
| Normalized manifest `dependencies` | Includes ZBP and optional geography dependency, but no acquisition operation, plan, journal or runtime chain. | Persist acquisition manifest hash and operation/run identity, plus plan, journal, metadata and runtime hashes through the managed receipt. Recheck pinned input identity before finalization. |
| `verifyOvertureUsPlaces` | Checks artifact hashes, totals, duplicate identities and selected semantics, but accepted the reproduced name mismatch. | Deterministically replay every selected source record and compare every normalized/quarantine record, including placement and ordering. |
| `managed-operations.mjs`, `server.mjs` | Acquisition endpoint exists; this normalization handoff is not enrolled. | Add managed local operation only after replay and input binding are implemented; retain verified output before a separate explicit promotion. |

## Next implementation acceptance criteria

1. Use the same pinned transformation version and explicit run/time/release context to replay each retained source record. Validate context against the managed receipt rather than trusting arbitrary normalized values.
2. Stream the selected source once and compare expected output against the next record in its deterministic partition (or quarantine stream). Require exact semantic object equality, no missing/extra records, correct partition, and EOF on all outputs. Keep buffering bounded; do not reintroduce a national in-memory identity or row map.
3. Retain and verify the baseline input used for address membership and state-conflict calculations. A mutable `current.json` or a reassembled coverage table is not sufficient provenance.
4. Test recomputed-hash mutations across names, addresses, separate ZIP5/ZIP4, coordinates, taxonomy, status, brand, source identifiers, timestamps and quarantine reasons; test omissions, additions and partition changes. Preserve positive fixtures and genuine numeric zero.
5. Test cancellation during input verification/copy/replay and before receipt publication. Any unresolved failure remains retained for inspection, with no successful managed result or current-pointer mutation.
6. Enroll the app worker with durable receipt and immutable acquisition/baseline references. Reuse retained inputs; promotion must not redownload them. A clean acquisition remains a separate prerequisite, not established by this audit.

No production code changed in this audit, so the previously passing full-suite result belongs to `1d1b04e`; it is not proof of the missing replay behavior. The national coverage goal remains incomplete.
