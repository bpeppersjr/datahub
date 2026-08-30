# Entity-resolution benchmark and review gate

This dataset creates a reproducible human-review packet for the governed national business entity-resolution release. It never generates ground-truth labels and never changes a registry entity, source assertion, or resolution decision.

## Sample design

The publisher enumerates three candidate universes:

- automatic physical-site membership pairs, each comparing a resolved group member with its deterministic group anchor;
- automatic establishment membership pairs under the stricter exact-address-and-name rule; and
- unapplied review-candidate pairs for calibration and operator-workflow measurement.

Within each stratum, the publisher retains the 425 lowest SHA-256 priorities under a versioned public seed. This deterministic min-hash method makes reruns against the same immutable dependencies reproducible and prevents an operator from hand-selecting favorable cases. Each selected pair is enriched from the checksummed registry location profiles and retains source identity, release, record, observation time, names, address, identifiers, status, and export policy.

Review packets can include home-based addresses and linkage evidence. They remain `local-review-only`.

## Labels

Reviewers edit a copy of `review/label-template.jsonl` using exactly one of:

- `match`: the pair is the same real-world site or establishment at the reported observation times;
- `non-match`: the pair is distinct;
- `uncertain`: available evidence is insufficient; or
- `not-reviewable`: the packet is invalid, inaccessible, or inappropriate for that reviewer.

Every completed label requires a reviewer ID and timestamp. `non-match`, `uncertain`, and `not-reviewable` also require an evidence note. Corrections must publish a new immutable label release rather than erasing the original judgment.

No automated model, including this software, is allowed to fill the benchmark labels and call them ground truth.

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
npm run entity-resolution:benchmark:evaluate -- --labels data/business-entity-resolution-benchmark/labels/completed-labels.jsonl
```

The build publishes an immutable `awaiting-independent-labels` sample and a null label template. The evaluator can report incomplete progress at any time, but the gate remains false until every automatic sample row satisfies the rules above.

## Validated live sample

The independently verified sample `business-entity-resolution-benchmark-sample-20260830-210015066Z-d9d1af77` is tied to resolution release `business-entity-resolution-20260830-204410292Z-371d0923` and registry release `national-business-registry-20260830-201530698Z-7230b6a4`. It sampled 425 candidates from each of these enumerated universes:

- 1,014,108 automatic physical-site membership pairs;
- 32,623 automatic establishment membership pairs; and
- 53,727 unapplied review candidates.

The 1,275-row packet contains 2,544 unique source-preserving profiles. Its label template has 0 submitted labels, so both the precision gate and export authorization are correctly false.
