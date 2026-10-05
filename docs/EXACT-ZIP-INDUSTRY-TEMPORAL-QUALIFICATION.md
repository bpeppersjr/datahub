# Exact-ZIP industry temporal qualification

`exact-zip-industry-temporal-qualification@1.0.0` is a pointer-free, local-review-only derivative joining the 39 dimensions in the registered v1.8 exact-ZIP industry matrix to the selected national temporal-claim matrix and retained ZIP-active-evidence qualification release. It binds source release IDs and manifest hashes, matrix artifact-inventory hash, temporal artifact hash, qualification projection hash, qualification artifact-inventory hash, registration hashes, and the fixed assessment time `2026-10-02T16:30:00.000Z`.

The selected local release is `exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503` (manifest SHA-256 `771a0f27951569bc7f1a96d02b8b9f114b65b2a37fdb1db3fb98217c6ad50e3e`; qualification artifact SHA-256 `958cb73f61dc27bf8bbbcb3f3e666917f8c885a59bf1470129ccadb5e2a862ed`).

The closed dimension mapping contains 30 mapped dimensions across 28 temporal source keys. Healthcare organizations and pharmacy share the NPPES key; Oregon legal-registration and brand-registration rows share the Oregon registry key, while remaining separate dimensions. CMS hospital, CMS nursing-home, and the seven PA/CT/MD/VT/CO/UT/IA childcare candidate dimensions are explicitly unmapped. Unknown or duplicate dimensions/source bindings fail closed.

The derived counts are 25 within-review-window dimensions, one stale NY retail-food dimension, four unmeasured childcare reporting dimensions (MA/NJ/TN/OH), and nine unmapped dimensions. The qualification cell accounting is `1,204,850 + 48,194 + 192,776 + 433,746 = 1,879,566` (48,194 ZIP cohort members by 39 dimensions). Semantic classes account for 1,060,268 source-defined-current cells, 385,552 non-active-reporting cells, and 433,746 unmapped cells. These are overlapping source rows, not unique businesses. Every row keeps `current_operations_verified: false`; source-defined-current is a source classification and is never elevated to verified current operation. Assessment and review due times are retained from the fixed 2026-10-02 qualification assessment, not recalculated from build or read time.

The generated immutable release remains a local retained artifact under ignored `data/`. To reproduce or verify it offline:

```powershell
npm run exact-zip-industry-temporal-qualification:build
npm run exact-zip-industry-temporal-qualification:verify
```

The tracked registration pins the immutable local release ID and hashes. The exact-ZIP evidence API and ZIP GDP view validate and expose the per-dimension temporal/review qualification, with explicit wording that review eligibility and source-defined semantics do not establish current operation. No source acquisition, network requests, runtime pointer updates, production enrollment, additive cross-source totals, or completeness claims are performed.
