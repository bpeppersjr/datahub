# Co*Tive-owned Utah PDF runtime

The offline [PDF prerequisite](UT-CHILDCARE-PDF-PREREQUISITE.md) now has a standalone environment, supervised execution and internal receipt writer. It does not require Codex to execute. It is not yet enrolled as a managed acquisition/refresh operation or a normalized business release.

## Provisioning

From the repository, run:

```powershell
./scripts/setup-pdf-runtime.ps1 -BasePython 'C:\Python314\python.exe'
```

This reviewed lock targets Windows x64 CPython **3.14.7**. The independently installed system Python is a prerequisite: this is an app-owned virtual environment, not a hermetic portable Python bundle. The setup rejects Codex runtime paths, checks for redirected destination paths before writes, and places its environment and install reports under `data/runtimes/pdf-decoder-1`. Do not relocate/remove the base interpreter without reprovisioning and verification. Other platforms/interpreter versions are not enabled by this application wrapper.

`config/pdf-runtime-win-cp314.lock` pins all eight resolved packages and wheel hashes. Pip uses only binary wheels, hash-required installation and the official PyPI index. Temporary files remain under `data/tmp`; install reports use distinct names so later setup attempts do not replace earlier evidence. No source dataset is downloaded by setup. Installed dependency consistency is checked; this is not an independent Python vulnerability audit.

The runtime probe checks package versions and declared distribution file hashes, with streamed per-file/aggregate limits. It records the package RECORD inventory, virtual-environment launcher and three base executable/DLL hashes. It does **not** attest the entire base standard library or every unrecorded importable file, and a local actor able to change both code and its metadata is outside this evidence boundary. The wrapper compares the observed inventory and implementation hashes before and after processing.

## Standalone local processing

```powershell
node scripts/process-ut-childcare-pdf.mjs --source 'data/business-sources/ut-childcare/assessments/85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa/source.pdf' --sha256 85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa --edition 'September 2026'
```

This reads the retained source; it does not refetch it. The CLI returns only aggregate counts and the receipt location/hash, never glyphs or business names. Successful output lives in a new UUID directory under `data/business-sources/ut-childcare/pdf-prerequisites`: selected observations first, receipt last. The writer accepts only an unmodified result from its current native invocation. Failed/cancelled publication removes that invocation's unpublished directory; completed receipts are not overwritten or removed. There is no acquisition checkpoint or scheduled-refresh claim.

Receipts bind input path/hash/length/edition, observed runtime fingerprints, implementation hashes, process limits/exit evidence and selected-output hash. They preserve an explicit `internal-prerequisite-only` export policy and do not claim independent publisher authentication, current operation, public redistribution authorization or national coverage. An independent replay verifier and acquisition-origin linkage remain required for downstream release enrollment.

Exception/cancellation cleanup is scoped to the current invocation. Abrupt host termination can leave an unpublished directory; absence of the final `receipt.json` means it is incomplete, not a completed result. Startup reconciliation and operator-visible recovery of those partial directories must be integrated with the managed workflow before enrollment.

## Process limits and cancellation

The wrapper supplies a minimal environment, uses a fixed app interpreter/script, disables the shell and Python user/environment imports, and hides subprocess windows. Python installs a verified Windows Job Object **1 GiB committed-memory cap** before PDF imports. The guard watches stdin cancellation and its own 60-second deadline. The parent has a separate 60-second decoder timer, sends cooperative cancellation, then allows up to two seconds before forced termination; it waits for process closure. Runtime probes have a separate 15-second parent budget. The Python guard is not an untrusted-code sandbox. Decoder code must not create descendants.

Decoded stdout is capped at 64,000,000 bytes, never logged, and passed directly to the layout validator; stderr is counted/capped and redacted. Python flushes output before releasing its watchdog. Layout validation and JSON processing consume the Node host's memory separately; the Python cap is not a whole-app or concurrent-job memory cap. Existing app resource scheduling must account for both before enrollment.

## Verification and remaining enrollment

Focused tests cover actual Windows limit configuration, allocation denial, cooperative/hard timeout, EOF/byte cancellation, process closure, output floods, secret noninheritance, malformed options, retained document conservation, actual decoder cancellation and internal receipt/hash preservation. Runtime integration is opt-in with `DATAHUB_TEST_APP_PDF=1`; guard/decoder tests use `DATAHUB_TEST_PDF_PYTHON` pointing to the app-owned interpreter. No test downloads a publisher source.

Next add the reviewed Utah source/acquisition contract and origin-linked replay verification, normalize selected observations, and register the workflow with Co*Tive's managed operation/refresh system. Only then dispatch acquisition and release agents from routine download progress. Rollback removes this unenrolled runtime/CLI integration; retained source data remains unchanged. Keep any generated receipts for provenance, rather than treating rollback as permission to delete them.

## Verified local execution, September 8, 2026

The standalone command completed at `2026-09-08T23:54:54.181Z`, retaining `data/business-sources/ut-childcare/pdf-prerequisites/e3332e6b-da88-4110-820b-24ad87758caf/receipt.json` with SHA-256 `2263a8731bc9774c057d3c260b69c46d564bb50630a49ca01f3f23fbe4082ccb`. Its selected artifact SHA-256 is `7133e8ff5aeb83bc7c86f01b661496961e1506ae906d2d3d71e7343e0c527d02`: 1,961 source rows and 422 selected observations. Source, artifact and implementation hashes were reread and checked after retention; process exit was zero. This is a real local prerequisite receipt, not an app acquisition operation ID or independent origin/replay attestation. The earlier `be2ca4d5-6041-477b-9ef4-300aa62635ec` receipt remains preserved; the latest local run reflects a whitespace-only guard cleanup, with identical selected data and no refetch.

All 34 focused tests passed using the app-owned interpreter. `npm run check` passed with all integration opt-ins enabled: 1,411 tests, 1,400 passed, 11 skipped and zero failures, plus lint, builds and desktop smoke. TypeScript and PowerShell syntax checks passed; the Node production dependency audit reported zero vulnerabilities. Python dependency consistency/file-record checks passed but are not that Node audit or an independent Python security audit. All 82 pending national production pins remained unchanged. Full log: `data/tmp/ut-pdf-runtime-full-check.log`. The idle development service was restored after verification.
