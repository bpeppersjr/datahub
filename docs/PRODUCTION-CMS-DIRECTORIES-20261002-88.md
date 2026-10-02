# Proposed additive CMS directory production — October 2, 2026

Plan 88 is the current clean-repository successor after committing the governed Census ZBP ZIP-industry profile index, registration, bounded reader, inspector integration, and accessible UI.

- Run ID: `production-cms-directories-20261002-88`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-88.json`
- Exact confirmation SHA-256: `8efeeecd9615ba24166df6a7c4322b8d59cef8a0c3ecb21c0460b5c759af02db`
- Plan file SHA-256: `7281c2d33f9cb63a0d379d29b8ac9592b5b675c62560303ad593672419559526`
- Planning repository commit: `1dc69d6`
- Created: `2026-10-02T22:19:51.13Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The registered Census ZBP 2023 ZIP profile index is metadata-only and is not enrolled as a production action. Its content-addressed release is `census-zbp-zip-profile-index-330d1c58516ff3a85003c06e717d00071cda259f13dbcc624b863fd601952c58`, with manifest SHA-256 `485f19b9715eb3807ef4d6dfa5a98c353645690f47c3b55a52b16487933e316d`. It conserves 2,974,116 ZIP-by-NAICS rows across 37,828 observed ZIPs and 1,908 published codes in ten bounded profile shards plus ten offset indexes. It publishes no current pointer and performs no source acquisition.

The ZIP inspector now returns the exact annual employer-establishment profile in the same bounded response as other ZIP evidence. The UI exposes exact publisher NAICS rows, establishment totals, employment-size counts and suppression codes. It explicitly withholds GDP allocation, current-operation status, non-employer coverage, hierarchy aggregation, and nationwide completeness claims. Publisher place labels are not treated as governed geographic assignments; absent and denominator-only ZIP results remain distinct.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 231,927,844,864 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Independent review found no introduced correctness or security issue. Focused index, registration, reader, inspector, and UI tests passed, including a native maximum observed ZIP profile of 837 industry rows and a 575,910-byte composed response below the two-megabyte cap. The full repository gate ran 2,989 tests: 2,914 passed, 75 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, 200% keyboard UI acceptance, and production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 87 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 88.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-88 --expected-plan-sha256 8efeeecd9615ba24166df6a7c4322b8d59cef8a0c3ecb21c0460b5c759af02db
```
