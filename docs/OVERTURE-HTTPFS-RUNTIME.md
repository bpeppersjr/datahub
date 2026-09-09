# App-owned Overture httpfs runtime prerequisite

This prerequisite prepares a local software dependency, not business records. It does not enable the Overture Places extraction, modify national pointers, or authorize a large source download.

## Reviewed delivery and trust boundary

DuckDB's [advanced installation documentation](https://duckdb.org/docs/current/extensions/advanced_installation_methods) specifies version/platform-specific compressed extension files. The fixed target is `https://extensions.duckdb.org/v1.5.5/windows_amd64/httpfs.duckdb_extension.gz`, matching the installed engine (`v1.5.5`, `windows_amd64`) and Node API package `1.5.5-r.4`.

One metadata-only HEAD on September 9, 2026 returned HTTP 200, no redirect, declared size 10,348,277 bytes, and Last-Modified July 21, 2026. Those headers are delivery observations, not a content hash, signature validation, or installation receipt. The worker must enforce its own streamed limits and verify the actual delivered binary.

The [official httpfs repository](https://github.com/duckdb/duckdb-httpfs) identifies its license as MIT. This workflow uses the official extension as an internal runtime dependency; it does not expose a binary redistribution endpoint. Any future packaging or redistribution needs applicable dependency notices and license review. This is separate from Overture record-level licensing.

DuckDB [checks extension signatures during loading](https://duckdb.org/docs/current/operations_manual/securing_duckdb/securing_extensions). The worker disables unsigned and community extensions, as well as automatic extension installation/loading. It explicitly loads only the retained local binary, with core-signature checking enabled. Native extensions run with the worker's privileges; these settings do not provide an operating-system sandbox. The supervisor's checksum reader does not itself execute the extension or independently attest the publisher's signature.

## Application contract

- Authenticated `POST /api/data-operations/source-prerequisites` accepts only `{"sourceId":"overture-httpfs-runtime"}`. No caller URL, version, platform, path, SQL or source-acquisition authorization is accepted.
- Co*Tive allocates an operation ID and runs `scripts/prepare-overture-httpfs-runtime.mjs` with app-selected `--output` and `--operation-id` arguments. The existing reservation prevents overlapping managed operations.
- One fixed HTTPS package request is allowed, with redirects rejected, no retry, 16 MiB compressed and 64 MiB decompressed ceilings. A 60-second cooperative deadline covers work; it is not a hard process-RAM or termination guarantee.
- Run-specific files, extension/home/spill directories and the final manifest remain inside the operation's `output/jobs/<UUID>` directory. Publication is last. Failed or uncertain outputs remain for inspection.
- The supervisor validates the descriptor and independently checks the bound manifest and artifact hashes. A zero exit code alone cannot establish success. Cancelled, nonzero or recovery-envelope results require inspection and cannot report runtime readiness.
- `runtimeReady` describes this retained prerequisite only; `acquisitionReady` remains false. No generic artifact route exposes executable files. Catalog readiness means the prerequisite is callable, not that a runtime installation already exists.

## Reuse, cancellation and recovery

The retained operation and its checksummed files are the handoff evidence. Future acquisition workers should select and verify these exact artifacts, not redownload the dependency for each state. This increment does not yet wire that consumer or select a shared runtime cache. Repeating the prerequisite manually creates a separate run; there is no automatic deduplication, installation retry, recurring refresh or dependency update.

CLI cancellation uses Co*Tive's existing signal/IPC bridge. Native operations are interrupted cooperatively and drained before handles close; native open/close calls are not forcibly preemptible. Existing managed cancellation escalation remains separate. Restart does not silently retry uncertain operations; existing ownership handling exposes failed/unknown state for inspection. Preserving incomplete output is not automatic recovery or complete rollback.

## Verification and release status

Release verification passed: `data/tmp/overture-httpfs-runtime-full-check.log` records 1,583 tests (1,572 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. TypeScript passed and the production dependency audit found zero vulnerabilities; all 82 protected production pins remained unchanged. Tests using fabricated descriptors/manifests prove rejection and structural checks only, not a genuine signed extension load. Record live app handoff separately below; passing tests do not establish a successful native runtime receipt.

No business schema migration is required. Rollback removes this prerequisite's enrollment and worker support while retaining operation receipts and files for inspection. It must not alter the protected production plan or delete previously collected business data.

## Verified native application handoff — September 9, 2026

The authenticated app accepted operation `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1` with HTTP 202. The app-owned worker completed successfully between `2026-09-09T07:19:53.226Z` and `2026-09-09T07:19:55.114Z`. Its persisted operation receipt is `data/managed-operations/b4ae8318-e786-4ac8-bf7b-e673c6d00ae1/receipt.json`, SHA-256 `9f07120d17cdc49e485a1854053d3e7d5ae6c4bca461f54579e6f8ada4d7ea29`.

The bound manifest is `output/jobs/95297faf-3622-4bab-93aa-134a7e8bca7f/manifest.json` beneath that operation, SHA-256 `62eda60204895b2553a9c15abebf64ad48f65b2f1c8213e10dccf2ee1ba940b2`. It records native core-signature-checked local loading for engine `v1.5.5`, platform `windows_amd64`, and Node API package `1.5.5-r.4`.

Retained artifacts:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `httpfs.duckdb_extension.gz` | 10,348,277 | `bb4a9f2721c43439006e6e776364a748d2469f92dfe5e5ebe365ed10e2be0e78` |
| `httpfs.duckdb_extension` | 28,527,638 | `65661c40463e74751993e8a7cb7b4c8906be9218319616a0bdfc1b4ae9ffdf9a` |

A separate bounded reader invocation verified the manifest binding and both retained artifact hashes after completion. That read did not load the extension again or request the source. The operation reports `runtimeReady: true`, `inspectionRequired: false`, and `acquisitionReady: false`. These exact retained files are the reuse candidate for future extraction workers; no shared-cache enrollment or Overture data query was performed. The handoff used one app submission and no ordinary download polling loop.
