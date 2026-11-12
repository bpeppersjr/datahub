# Production reconciliation successor 293

Run `production-cms-directories-20261112-293` is a planning-only successor to plan 292. It was created on November 12, 2026 after the verified Iowa business-registry refresh and the refreshed Pennsylvania and Vermont childcare enrollments. No production run directory exists, no acquisition was performed, and no production pointer was written.

The immutable local plan is `data/reconciliations/production-plans/production-cms-directories-20261112-293.json`. Its confirmation SHA-256 is `ce6852dfc40385d43eddbf358c94a80c0d6a2ebb804a6184ba955d9346c80ded`; the plan file SHA-256 is `323382ab8bc186925671e46c3be3d557e116318db49cb74d9341ed7d5d336ff9`. Execution requires separate approval of that exact confirmation hash.

The plan contains 25 base source pins and eight stages under `national-12g` (12 GiB old-space ceiling, 16 GiB minimum free memory and 24 GiB minimum total memory). Its Iowa source pin selects release `ia-business-registry-20261112-225308995Z-188ec774`, manifest SHA-256 `f26e37689c9663b80a80682c0115090c89b360ff061b9caf5c875c30d43814c1`, through pointer SHA-256 `95ac965b2f175ac7f8c648ea3c83204e20608ef167db8c70777b8ccf7413e770`.

The read-only production preflight returned `READY`: every plan pin revalidated, all eight stages are local, source-acquisition and network stage counts are zero, and no writes were performed. At that observation it reported 27,303,440,384 available disk bytes against 13,287,142,822 required bytes. Resource availability is rechecked at execution and is not reserved by planning.

The retained childcare selection is `config/retained-childcare-registry-selection-20261112.json`, SHA-256 `5cf0cfb3d2ad2c1d8751c2dbdec0fe1a0885aa0f7788a72b8a77e64c240280c3`. It selects exact enrollments for PA, CT, MD, VT, CO, UT and IA and replays 12,234 source-candidate rows. The 28-row increase over plan 292 is the net effect of the refreshed PA and VT cohorts. ZIP5 and ZIP+4 remain separate; these rows remain retained source candidates rather than verified active businesses or physical sites.

The Minnesota credential, CMS hospital and CMS nursing-home pin objects are byte-for-byte unchanged from plan 292. Their selection paths and hashes remain:

- `config/mn-credential-registry-selection.json` — `bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`
- `config/cms-hospital-retained-selection.json` — `1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`
- `config/cms-nursing-home-retained-selection.json` — `f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`

Planning validates retained inputs and implementation pins but does not prove that execution will succeed, that publisher data are complete, that all businesses have geocodes, or that an all-business denominator exists. The existing national registry remains authoritative until a separately approved run succeeds and its output verifiers pass.
