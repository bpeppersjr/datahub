# Entity-resolution benchmark and review gate

This dataset creates a reproducible human-review packet for the governed national business entity-resolution release. It never generates ground-truth labels and never changes a registry entity, source assertion, or resolution decision.

## Sample design

The publisher enumerates three candidate universes:

- automatic physical-site membership pairs, each comparing a resolved group member with its deterministic group anchor;
- automatic establishment membership pairs under the stricter exact-address-and-name rule; and
- unapplied review-candidate pairs for calibration and operator-workflow measurement.

Within each stratum, the publisher retains the 425 lowest SHA-256 priorities under a versioned public seed. This deterministic min-hash method makes reruns against the same immutable dependencies reproducible and prevents an operator from hand-selecting favorable cases. Each selected pair is enriched from the checksummed registry location profiles and retains source identity, release, record, observation time, names, address, identifiers, status, and export policy.

Review packets can include home-based addresses and linkage evidence. They remain `local-review-only`.

## Offline source-bound replay

`npm run entity-resolution:benchmark:verify-source-replay -- <benchmark-manifest.json> <resolution-manifest.json> <registry-manifest.json>` independently checks the explicit retained dependency hashes, source-bound resolution replay, complete candidate universes, deterministic min-hash selection, enriched profile evidence, null label template and summary. It reads only local files and never publishes, acquires, changes pointers or supplies review judgments. Structural verification alone does not establish this stronger proof.

The replay reader rejects linked paths and consumes the same bytes for checksumming and parsing. Its mandatory resolution replay binds the exact expected resolution and registry manifest hashes before parsing dependent artifacts and returns consumed hashes for comparison. It does not call the unbounded structural-verification path. JSON inputs are capped at 32 MB; each gzip partition is capped at 512 MB compressed, 1.5 GB decoded, two million rows and 8 MB per row. Reporting-only partitions retain a one-million-row aggregate cap. Ohio 2.15 retained membership uses its existing bounded dependency readers with the cancellation signal propagated through context loading and final membership verification. Selected profiles plus global profile, decision, and automatic-subject identity sets are retained in memory; decision record arrays are bounded to one ZIP2 partition. Manifest snapshots must remain unchanged through completion. The accepted sample size is 384 through 10,000 per stratum. Exceeding a bound fails rather than reporting partial success. Cancellation is cooperative during input reads and between partitions; synchronous rule evaluation completes before the next signal check. Source replay proves reproducibility, not real-world matching accuracy: independent human labels and separate export-policy review remain required.

## Independent labels

Reviewers edit a copy of `review/label-template.jsonl` using exactly one of:

- `match`: the pair is the same real-world site or establishment at the reported observation times;
- `non-match`: the pair is distinct;
- `uncertain`: available evidence is insufficient; or
- `not-reviewable`: the packet is invalid, inaccessible, or inappropriate for that reviewer.

Every completed label requires a reviewer ID and timestamp. `non-match`, `uncertain`, and `not-reviewable` also require an evidence note. Corrections must publish a new immutable label release rather than erasing the original judgment.

No automated model, including this software, is allowed to fill the benchmark labels and call them ground truth.

## Operator review page

Co*Tive Collector exposes the current sample in the local management page under **Entity-resolution review**. The runner binds to loopback and provides:

- verified packet pagination and filters by stratum and label status;
- side-by-side source names, reported addresses, record IDs, and observation dates;
- reviewer-ID capture and the four governed label actions;
- required notes for non-match and exclusion judgments;
- optimistic concurrency through a content revision, so a stale browser cannot overwrite newer work;
- an atomic working label copy outside the immutable sample release;
- two-phase `proposed` and `committed` events in an append-only local audit journal; and
- live per-stratum Wilson metrics plus an explicit export prohibition.

The working copy can be downloaded as JSON Lines. It is not yet a published immutable label release; that publication step remains a separate gate so incomplete work cannot be mistaken for an approved benchmark.

## Immutable label snapshots

After at least one independent label is saved, preview and explicitly publish an immutable snapshot. Finalization is bound to the registered current sample, its pointer and manifest hashes, the full working-label revision, audit-journal hash, schema/policy registrations, operator, and the previously selected label pointer. Preview does not write files. The empty live template returns `ready: false`, no preview token, and a blocker; publication requires an explicit confirmation and cannot turn a precision pass into export permission.

```powershell
npm run entity-resolution:benchmark:labels:publish -- --preview --operator-id reviewer-lead --expected-revision <working-revision-sha256>
npm run entity-resolution:benchmark:labels:publish -- --publish --operator-id reviewer-lead --expected-revision <working-revision-sha256> --preview-token <preview-token> --confirm "PUBLISH LABEL SNAPSHOT"
npm run entity-resolution:benchmark:labels:verify
```

The publisher refuses an empty working set. It stores submitted labels, the exact working-set SHA-256, aggregate automatic-rule metrics, and source-pair diagnostic counts under a checksummed dependency on the immutable sample. Partial snapshots remain explicitly incomplete; later corrections create a new release. The label CLI accepts no file paths and has no direct `--labels` publication bypass; the read-only evaluator reports the registered working draft only. Publication receipts support same-preview retry/reconciliation and immutable releases are verified before pointer installation. Even a passing precision result sets `export_authorized` to `false` until privacy and every contributing source policy pass separately.

## Precision gate

Each automatic stratum is evaluated separately. A stratum passes only when:

1. all 425 sampled candidates have a submitted label;
2. at least 384 labels are conclusive `match` or `non-match`;
3. exclusions are no more than 10% of the sample; and
4. the two-sided 95% Wilson lower confidence bound for precision is at least 0.99.

With 384 conclusive labels, even one confirmed false link normally fails this conservative gate. The review-candidate stratum measures workflow yield and is not an automatic-link precision gate.

This benchmark estimates precision, not recall, and overall rule precision can hide source-pair-specific errors. A precision pass never authorizes export; every contributing source policy and privacy classification must still pass separately.

## Commands

```powershell
npm run entity-resolution:benchmark:build
npm run entity-resolution:benchmark:verify
npm run entity-resolution:benchmark:evaluate
npm run entity-resolution:benchmark:evaluate -- --labels data/business-entity-resolution-benchmark/labels/diagnostic-labels.jsonl
```

The build publishes an immutable `awaiting-independent-labels` sample and a null label template. The evaluator can report registered-draft progress or read a bounded (4 MiB maximum) local JSONL file through the same strict label parser; it never writes or publishes that diagnostic input. It cannot select arbitrary benchmark manifests, and labels must refer to candidates in the registered sample. The gate remains false until every automatic sample row satisfies the rules above.

## Validated live sample

The retained sample `business-entity-resolution-benchmark-sample-20260911-040724863Z-9844fbb3` is tied by exact manifest hashes to resolution release `business-entity-resolution-20260911-040411512Z-e6812503` and registry release `national-business-registry-20260911-022652067Z-1ec656c3`. It sampled 425 candidates from each enumerated universe:

- 1,449,108 automatic physical-site membership pairs;
- 74,738 automatic establishment membership pairs; and
- 106,063 unapplied review candidates.

The 1,275-row packet contains 2,545 unique source-preserving profiles across three artifacts totaling 941,342 manifest-declared bytes. Its label template has zero submitted labels; the precision gate and export authorization remain false. Reporting-only locations, separately retained childcare candidates, and Minnesota credential rows are not identity-matching benchmark populations.

The dataset catalog binds the current pointer, manifest hash, publisher, timestamp, status, dependencies and headline sample counts. The read-only release-chain catalog test checks those bindings against retained manifests; it is not a new artifact-content replay, independent labeling, acquisition or publication.

## Governed label import

The review workspace accepts a strict UTF-8 JSONL subset or full upload as a two-step draft workflow. Each row must match the versioned label schema exactly; uploads are limited to 4 MiB, 16 KiB per row and 1,275 rows. Unknown/duplicate candidate IDs, duplicate rows, invalid/future timestamps, invalid null-row attribution, and unsupported fields fail closed. Evidence references are recorded as strings only and are never fetched.

Preview is read-only. It binds the immutable benchmark release/manifest and current pointer hashes, expected working-label revision, raw upload SHA-256, canonical merged-label SHA-256, importing operator, and explicit conflict decisions. It reports row changes and before/after per-stratum precision gates while remaining `draft_only`; export authorization remains false. Omitted rows retain their current value, imported null rows never clear a judgment, and exact matches are unchanged. A changed completed judgment requires an explicit per-candidate keep-existing decision or replacement with a correction reason.

Commit resubmits and recomputes the preview under the same serialized cross-process mutation lock used by individual reviewer saves. It appends a proposed batch audit event with prior/next row values, atomically replaces one full working-label file, and appends the matching committed event. A working revision mismatch returns conflict; if replacement succeeded but the committed event could not be confirmed, the operation requires inspection and an identical retry reconciles the proposed event. The importing operator is audited separately from row-level reviewers.

These endpoints only update the local working-label draft and audit journal. They do not modify the immutable sample/template, publish a label snapshot, apply identity aliases, or authorize exports. The explicit label-snapshot publication command remains a separate governance action.
