# Ohio childcare offline normalization and immutable releases

This is the next stage after the [Ohio acquisition evidence contract](OH-CHILDCARE-PREFLIGHT.md#remaining-acquisition-work). It turns supplied, replayable selected-field evidence into a versioned local review dataset. It does not contact Ohio, accept agreements, authorize acquisition, enable schedules or integrate national reporting. No live Ohio facility data was downloaded during implementation.

## Standalone commands

```powershell
node scripts/build-oh-childcare-offline.mjs <source-observation.json> [--output <folder>]
node scripts/verify-oh-childcare.mjs <immutable-manifest.json>
```

Both commands accept `--help`. Inputs and outputs must remain inside datahub. The default build root is `data/business-sources/oh-dcy-publisher-open-childcare-centers/offline`. The verifier requires the actual `releases/<release-id>/manifest.json`, not `current.json`. These commands need Node, not a running AI agent. They process retained evidence only; they are not yet enrolled as a live collection job.

## Business records and quality

`oh-childcare-normalization@1.0.0` reconstructs the acquisition contract before converting any rows. Output contains business name, physical street/city, source county text, state/country, separate ZIP5 (`zip_code` and equivalent `postal_code`) and ZIP4 (`zip4`), and nullable WGS84 latitude/longitude. Business records have no polygons or raw geometry. Source county text is not Census county assignment. No suite, capacity, parent company or operating/license dates are invented.

Only positive safe-integer source `program_number` values become strings typed as `ohio_dcy_program_number`; no leading zeroes are reconstructed and this is not a license, NABP, NPI or verified business identity. A null program number remains an accepted record with a missing-identifier reason. Fractional, unsafe, zero or negative program numbers are quarantined, preserving native values in the internal source evidence. Repeated program identifiers across different source object IDs are retained, not silently merged.

Publisher `Open` and `Child Care Center` scope is explicit and is not independent evidence of operation. Observation time comes from the actual supplied page observation; processing time is separate and must follow completed acquisition evidence. Source URL/filter, object ID, source snapshot ID, ingest run, input hash, transformation version, policy hash and field lineage accompany every accepted record. Quarantine records carry source/run/observation references and redacted reason codes.

Missing/blank, placeholder and malformed postal strings become distinct ZIP-unavailable reasons with all three normalized postal fields null. They do not cause otherwise usable centers to disappear, and coordinates never infer ZIP. Control characters, invalid required text and recognizable nonphysical mailing addresses are quarantined. Missing or implausible points remain explicit nullable quality gaps; incompatible CRS and malformed coordinate structures fail acquisition replay. Every selected row is accounted for exactly once in accepted or quarantined output.

## Artifact and publication contract

Each offline release contains exactly these four artifacts plus its manifest:

- `selected-features.jsonl`: internal, selected native source fields and point evidence.
- `normalized.jsonl`: local-review-only business evidence with split postal fields.
- `quarantine.jsonl`: internal redacted rejection references.
- `source-observation.json`: internal complete supplied acquisition evidence, including paired projected preflights.

No XML artifact is manufactured: the separate [notice availability review](states/OH-CHILDCARE-NOTICES-2026-09-08.md) records unavailable resources. Offline release verification does not claim current notices were rechecked or that synthetic fixture notices match the publisher. The pinned `oh-childcare-local-review@1.0.0` development policy remains acquisition/export unauthorized.

Builds use exclusive publication locks, UUID-scoped staging, bounded canonical-path reads, BigInt file ownership checks, explicit artifact byte ceilings, durable file writes, manifest-last publication and exact independent reconstruction before commit. Junctions, hardlinks, foreign locks, extra artifacts and nesting output within immutable bundles are rejected. Verification compares normalized and quarantine bytes against freshly replayed source evidence, not merely self-declared hashes, and repeats file/manifest checks to detect changes during replay.

Cancellation before commit removes only individually owned staging files and preserves previous releases and their pointer. Ordinary failures preserve completed source evidence for inspection. After the commit boundary, publication finishes without cooperative interruption. This is not automatic crash recovery or a filesystem transaction across every file. If commit/finalization is interrupted, inspect retained state rather than clearing locks or rerunning blindly.

Reprocessing identical selected source content creates a new ingest/release ID and processing timestamp but retains the same content-derived source snapshot identity and source observation timestamps. Earlier releases remain intact. No repeated provider download is required for promotion.

An all-quarantined bundle can be retained as **offline review evidence**, never as a quality-passed business dataset. Manifest acquisition, public export, active-business verification, source authenticity/freshness, geographic assignment, unique business identity and nationwide completeness flags remain false. No production quality threshold or national reporting enrollment is implied.

## Verification and next steps

Six normalization tests and ten release tests cover postal formats, source identifiers, scope and provenance, row conservation, deterministic reprocessing, rehashed tampering, forged claims, cancellation, retained failures, locks, path aliases, final pre-commit revalidation and standalone CLI build/verify.

The full repository check passed all 886 tests, source checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. Independent read-only review found no actionable defect. All Ohio facility fixtures used here are synthetic; these checks are not evidence of a live acquisition or complete state coverage.

Next implement bounded source HTTP execution and bind current available notice evidence to the reviewed acquisition use; then enroll the validated connector as an app-owned operation with its own durable receipt. Production promotion requires separate quality and downstream integration checks. Do not repull an already verified release merely to promote it.

Rollback is code-only: revert this additive implementation if needed, preserving existing releases, retained evidence and production pointers. This increment changes none of the production source selections or schedules.
