# Proposed retained-data production reconciliation — October 6, 2026

Plan 213 is a planning-only successor to Plan 212 after promoting already-retained New York retail-food ZIP-address evidence into the pointer-free v3.0 exact-ZIP matrix. It does not authorize or perform production work.

- Run ID: `production-cms-directories-20261006-213`
- Plan confirmation SHA-256: `e9a2c280d60b9473d3ea4c79f1abe1af6aaf8c67b2be7ae8ad65cce2b6c00287`
- Plan file SHA-256: `a8d5c20b6c09523a20430f760957f4e8c53a24f52e679ff0032d7d8e6bf12b30`
- Predecessor plan: `production-cms-directories-20261006-212`

The pointer-free v3.0 matrix release is `national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9`, with manifest SHA-256 `07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7`. It preserves 48,194 ZIP5 rows and contains 51 dimensions and 2,457,894 cells. The new New York dimension conserves 1,500 positive ZIPs and 24,280 source-reported license-location address observations.

The annual source snapshot is stale non-active reporting, not verified current operation. Address evidence is not a physical-site or unique-business count, and the dimension is nonadditive with `ny_retail_food_location_profiles`. Record evidence remains local-review-only; aggregate use requires OPEN-NY attribution and semantic limitations.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same four retained selections and `national-12g` profile remain pinned. Available disk was 79,086,571,520 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable pointer write occurred. Plan 212 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-213 --expected-plan-sha256 e9a2c280d60b9473d3ea4c79f1abe1af6aaf8c67b2be7ae8ad65cce2b6c00287
```
