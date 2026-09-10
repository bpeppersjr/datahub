# Retained national baseline readiness

Inspected against code `d345127`. This records actual local verification, not a new publisher acquisition or a managed-operation receipt.

## Fixed release verified

- Dataset: `census-zbp-baseline`, reference year **2023**.
- Release: `census-zbp-2023-20260830-134622645Z-4da1edc0`.
- Manifest: `data/business-baselines/census-zbp/releases/census-zbp-2023-20260830-134622645Z-4da1edc0/manifest.json`.
- Manifest SHA-256: `db6ec348a46b4b3ad9692aafc1d47fd388308031e397fb5de8e0193df19bf271`.
- ZIP coverage SHA-256: `97268cd4c1f256f972bc455e7a80b31fc7b5a819cdc56514a2888344a34b0473`.
- ZIP coverage bytes: **88,395,583**, below replay's 128 MiB baseline-input ceiling.

`node scripts/verify-census-zbp.mjs data/business-baselines/census-zbp/releases/census-zbp-2023-20260830-134622645Z-4da1edc0/manifest.json` passed. The existing verifier checked 14 artifacts totaling 121,099,407 stored bytes, ZIP and NAICS coverage counts, and the ten compressed detail partitions. It reported 2,974,116 industry-detail rows and 1,908 published NAICS codes. These are aggregate data rows/categories, not unique business entities.

| ZIP/ZCTA relationship | Entries |
|---|---:|
| Present in ZBP and ZCTA | 30,917 |
| ZBP without ZCTA | 4,037 |
| ZCTA without published ZBP | 2,874 |
| Union | 37,828 |

The reference year is not 2026. Neither this union nor its successful verification establishes the current USPS operational ZIP universe or a census of currently operating businesses.

## Real-size baseline replay probe

`data/tmp/overture-national-baseline-probe.mjs` independently verified the fixed baseline, checked that the existing pointer selected it, and built a retained-only Overture fixture with one explicitly synthetic business record. The full baseline bytes were retained and replayed. Output verification passed with 37,828 ZIP union entries and one normalized synthetic record. The normalization plus second verification took 2,641 ms in this run; this is not a production throughput or peak-memory benchmark.

Evidence: `data/tmp/overture-national-baseline-probes/f4ed3852-57d5-4bcc-be2e-07010e38b30a/evidence.json`. The manifest hash was checked before and after; the output's recorded baseline hash matched. Output stayed below `data/tmp`, with status `verified-retained-not-promoted`, no current-pointer write and no new download. An unused pointer fixture in the probe directory is not an accepted immutable-selection contract.

## Integration decision

The baseline does **not** need reacquisition to proceed. The next implementation must admit an explicit immutable manifest path plus expected manifest hash, independently verify that release, and retain its exact coverage dependency. The legacy Overture loader currently accepts `zbpPointer` and does not invoke the full Census verifier. This audit is not a substitute for implementing those checks inside Co*Tive's worker.

Do not convert this manually observed verification into an app-owned operation receipt or treat a caller-supplied hash as authenticated provenance. The managed operation must resolve its permitted input, perform its own verification, and recheck selected inputs before finalization. Existing artifact and decompression checks in the Census verifier also need resource/cancellation review before accepting arbitrary input releases.

No production source code changed for this investigation; the last full-suite result remains the result for `d345127`. The probes supplied additional real-size evidence, not nationwide business completeness.
