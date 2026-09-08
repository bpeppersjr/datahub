# Delaware standalone app jobs

The `de-business-licenses-app` connector is distinct from the historical `de-business-licenses` connector pinned by retained national plans. Its fixed app entry point uses the existing governed Delaware transformations and source policy. Enrollment does not rewrite historical releases or production pointers.

An explicit fresh collection for `local-business-licenses`, state `DE`, source `state-de-business-licenses` invokes the standalone app wrapper. It checks contract/policy contents, resource prerequisites and the fixed Census baseline, then uses native HTTPS acquisition with source metadata/count checks and cumulative limits. Configured state means publisher jurisdiction: reported out-of-state addresses are not silently discarded. License candidates are not independently verified active businesses, unique establishments or physical sites.

Reuse an existing immutable release without a download:

```powershell
node scripts/run-de-business-app.mjs --output data/business-sources/de-business-licenses-current/app --retained-manifest data/business-sources/de-business-licenses-current/releases/de-business-licenses-20260903-002309163Z-f955c045/manifest.json
```

Omitting `--retained-manifest` requests a fresh acquisition. It does not consult a freshness cache or silently reuse data. Do not omit it merely to promote already retained evidence. The managed collection API does not accept arbitrary retained-manifest paths; explicit local reuse is currently a standalone CLI operation.

Verify the exact resulting receipt without source acquisition:

```powershell
node scripts/verify-de-business-app.mjs --receipt <returned-receipt-path>
```

Each invocation has an immutable UUID job with a start record and terminal evidence. Successful receipts bind the original source manifest hash, release identity, coverage and policy restrictions. Retained mode verifies dependencies locally; it does not modify the borrowed release. Fixed-native mode describes the wrapper used, not independently authenticated proof of transport execution. Contract/policy pins use hashes of parsed JSON serialized with `JSON.stringify`, so line-ending-only differences do not invalidate governance. Source manifests and receipts use exact byte hashes.

Cancellation does not mean rollback. Inspect retained job/publication evidence after failure or cancellation, especially around source publication. No automatic retry, crash recovery, schedule activation, public record-level export or national promotion is enabled by enrollment. Existing retained national evidence remains separate from new run-scoped acquisition output.

Rollback removes the new source from the industry configuration and reverts the new app wrapper/contract/CLI and ledger mapping after checking active operations. Preserve receipts, locks requiring ownership inspection and all retained source releases. Existing production-pinned connector contracts remain unchanged.

## Observed retained-data app execution

App job `982fb5e2-9bd8-4f33-95c5-3f923e8b6ec5` succeeded on September 8, 2026, from `14:56:43.013Z` to `14:56:44.207Z` in `retained-local-verification` mode. Its receipt is `data/business-sources/de-business-licenses-current/app/jobs/982fb5e2-9bd8-4f33-95c5-3f923e8b6ec5/receipt.json`, SHA-256 `0bd0c79ac5971767c04e023f7b0b03f01fb1d9bc8be6ddc460d15d176aa2d81a`. The independent app verifier rechecked the linked immutable release and receipt.

The job references the September 3 release with 67,829 source rows, 66,667 published license-based candidates and 49 quarantined source rows. Source manifest SHA-256 remains `5ab0bfe8e04ad2fffdd6cb66d3881639c18006311dba1cd52730ef25e8427eba`; historical pointer SHA-256 remains `01f31232fdbdd0e945daffa40dae334d3d52d0cf71f219a3d0f2776f8d33e505`. Physical-site and establishment counts remain null. This is a standalone app job, not a managed collection operation or evidence of a new live source download. No schedule or production promotion was dispatched.

Validation: five app test groups cover retained reuse, failure/cancellation receipts, unsafe options/paths, foreign locks, native-path synthetic acquisition, cross-job borrowing and contract drift; three CLI groups cover strict inputs and an actual retained CLI roundtrip with fetch blocked. The industry/ledger and authenticated connector-catalog tests passed. The first repository check caught two obsolete 49-connector expectations; updating them to 50 retained the historical Delaware contract assertion. Final `npm run check` passed with 1,157 tests (1,146 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop smoke. TypeScript passed, the production audit reported zero vulnerabilities, and all 82 pending production code/config pins remained unchanged.
