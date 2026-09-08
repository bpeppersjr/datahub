# Utah childcare PDF decoding and layout prerequisite

This is an offline implementation prerequisite, not a production connector or a new acquisition. It reuses the September 2026 report retained by SHA-256 in the [source assessment](UT-CHILDCARE-PDF-ASSESSMENT-2026-09-08.md).

## Two explicit stages

`scripts/decode-ut-childcare-pdf.py` reads a retained file inside `datahub/data`, checks the supplied complete-file SHA-256, and produces a full decoded page/glyph inventory on stdout. It requires exactly pdfplumber 0.11.9 and pdfminer.six 20251230. It does not search for an interpreter, install packages, fetch a source, repair a PDF, run OCR, or write a derivative file. Errors omit source contents and file paths.

The bridge uses actual character coordinates, not evenly divided PDF text-run widths. [pdfplumber's documented character geometry](https://github.com/jsvine/pdfplumber#objects) supplies the top-left coordinates. Header rules are measured from the document, not manufactured from the expected grid. Page count comes from the decoded page tree. Encrypted files, page rotation, images, annotations and nonempty action/form/name-tree catalog entries are rejected for review.

`runner/ut-childcare-pdf-layout.mjs` then validates the decoded inventory before selecting the exact `Child Care Center` category. All rows participate in identifier, category and layout conservation before filtering. Its output excludes phone numbers, separates ZIP5 and ZIP4, preserves source page/row references, and leaves operating status, address role and coordinates unknown. Calendar validation is not evidence of current operation. It does not authenticate the source independently of the decoder/hash stage.

## Runtime and privacy boundary

The decoder has a 500,000-byte input cap, 64-page and 500,000-glyph limits, and a 64 MB serialized output cap. These checks are not a hard memory or CPU sandbox: PDF decompression and page interpretation can consume resources before the inventory checks. The integration test supervises the child with a 60-second timeout and bounded stdout, but is not the production execution contract.

Decoded stdout contains the complete source inventory, including nonselected categories and phone fields. Never forward it to user-visible logs, export it as a business dataset, or persist it as an unrestricted artifact. Keep it inside the supervised decoding/layout process. Only the selected derivative may proceed to a future reviewed internal-only normalization stage. Preserve the unmodified source separately.

Before app enrollment, provision and verify an app-owned interpreter and its pinned dependency environment beneath `datahub`; do not use a Codex cache path as application configuration. Add supervised child execution with enforced elapsed-time/memory/output limits, cancellation and exit cleanup, version evidence, and run-scoped, hash-verified, manifest-last receipts. Bind source hash/length, decoder versions and validated output hash in those receipts; decoded JSON alone is not provenance evidence. Test these behaviors before enabling acquisition or scheduled refresh. No production enrollment is supplied by these files.

## Verification commands

Synthetic geometry checks run in the ordinary Node test suite:

```powershell
node --test runner/ut-childcare-pdf-layout.test.mjs
```

The retained-source integration tests are opt-in so clean checkouts never download publisher records or silently install Python. Set `DATAHUB_TEST_PDF_PYTHON` to an explicitly selected test interpreter with the exact versions above, then run:

```powershell
node --test runner/ut-childcare-pdf-decoder.test.mjs
```

That override is test-only, not a production runtime setting. Tests require the already retained hash-addressed source and fail if it is missing. They check source hash preservation, decoded inventory size, full row/category conservation, exact center selection and redacted prerequisite failures. Routine tests without the explicit interpreter report the retained-source tests as skipped, not verified.

## Verified increment, September 8, 2026

The actual retained document passed decoding and layout validation: 31 pages, 259,855 glyphs, 1,961 rows and 422 center observations, with all 11 category counts matching the independent assessment. All selected dates passed calendar validation. Source bytes were unchanged. Actual-document testing identified the `DATE:` edition prefix and bounded font kerning; regression tests cover these while still rejecting duplicate/contained glyphs and excessive overlaps.

`npm run check` completed successfully with the retained-source tests enabled: 1,389 tests, 1,378 passed, 11 skipped, zero failures; lint, builds and desktop smoke passed. TypeScript checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending national production pins remained unchanged. Full log: `data/tmp/ut-pdf-prerequisite-full-check.log`. No source acquisition or production enrollment was performed. Rollback is removal of this isolated prerequisite and its tests/docs; it has no registry or runtime integration and does not mutate retained data.
