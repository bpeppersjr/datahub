# Overture normalization replay

The normalizer now retains the exact baseline coverage bytes it used and records its transformation version, run identity, retrieval/observation times, baseline manifest hash and baseline coverage hash. This is local transformation evidence, not an authenticated managed acquisition receipt.

After existing integrity and semantic checks, the verifier streams the selected source and recomputes each normalized record. It compares the full object with the next record in the deterministic SHA-256-prefix partition. Expected quarantine records are compared in their own source order. All 16 partitions and quarantine must reach EOF without missing or extra records. Object property order is immaterial; array order and all field values remain significant.

The comparison covers names, address fields including separate ZIP5/ZIP4, geocode, classifications, source status, websites, brand, provider records, entity candidates, provenance, privacy and export-policy fields. Recognized normalization failures must produce the same quarantine identity and reason. It does not merely check whether values look valid.

The verifier keeps at most one iterator for each of 17 output streams and uses the existing bounded gzip reader. It does not retain a national row or identity map. The retained baseline reader is capped at 128 MiB and 100,000 unique five-digit rows; metadata used for observation-time context is capped at 4 MiB. These limits are not OS process memory caps. Existing earlier baseline loading/source copying and artifact hashing retain their previously documented limitations.

Optional verification cancellation is forwarded to the source, normalized, quarantine and baseline streams. Output iterators are closed in a finally block on success, mismatch or cancellation. Some existing hashing and duplicate-check work remains cooperative only between stages, not immediately interruptible. No hard deadline is claimed.

## Evidence

All 14 focused Overture tests passed, including repeated recomputed-hash mutations of normalized names, street address, ZIP4, coordinate, taxonomy, confidence, brand, provider ID, provenance timestamp, an added field, changed quarantine reason, missing replay context and pre-abort. Existing build, explicit promotion, duplicate and recovery fixtures also passed.

The original probe from `OVERTURE-FIDELITY-AUDIT.md` now reports `rehashed_altered_name_accepted: false`. The post-change evidence is `data/tmp/overture-fidelity-probes/9f83039f-f030-4a02-87e7-dc0d20957b79/evidence.json`. Its exit code is 1 because that diagnostic script intentionally returned nonzero when the old vulnerability was no longer reproduced; the focused regression suite passed normally.

Full `npm run check` passed: 1,682 tests, 1,671 passed, 11 skipped, zero failed, plus lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-source-replay-full-check.log`. TypeScript passed; `npm audit --omit=dev` found zero vulnerabilities. All 82 protected production-plan pins remained unchanged.

## Migration and remaining trust boundary

New retained releases include `source/normalization-baseline.jsonl` and `replay_context`. Releases without this evidence fail the strengthened verifier; they are not silently upgraded, deleted or republished. Reprocess from retained verified inputs to produce a new release. Rolling back the code restores weaker verification and should not be used as a promotion bypass.

This compares the stored source to the stored output using the recorded context and current declared transformation. It does not independently prove that those inputs came from a publisher, verify remote Parquet query correctness, establish current business operation, or protect against coordinated replacement of an entire unanchored evidence chain. Acquisition and baseline references still need binding to independently verified app receipts, and managed normalization/recovery enrollment remains unfinished. Reusing the same transformation detects storage/output divergence but is not an independent implementation of the transformation specification.

No new production acquisition, normalization or promotion was performed for this change. Co*Tive remains a local standalone app; no Sites deployment or cloud-storage migration is involved.
