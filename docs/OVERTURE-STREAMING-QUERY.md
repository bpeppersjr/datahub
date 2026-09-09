# Shared Overture selection query

September 9, 2026. Legacy file export and the forthcoming governed streaming worker now use one private SQL projection in `runner/overture-us-places.mjs`. This avoids a separate copy of country, status, address and field-selection rules.

`overtureExtractionSql` retains its existing COPY wrapper and output for the same inputs. `overtureStreamingSql` wraps the same selection with a single `record_json` VARCHAR column for the bounded streaming adapter. It only accepts one dense ordered array of 1–32 fixed-form loopback capability URLs sharing a port and capability, with each index matching its array position. It does not accept caller SQL, remote hosts, queries, credentials, alternative paths or mixed bridge instances. This is an internal builder; a future worker must pass URLs from its own bridge, not expose them as user overrides.

`overtureStreamingQueryFingerprint(assetCount)` hashes that exact streaming projection with indexed asset placeholders. It changes with the projection or asset count without persisting an ephemeral port/capability. This is a query contract fingerprint, not a substitute for source asset identities, dataset checksums, authorization or operation receipts. Actual query text remains private runtime data.

## Native selection evidence

The retained-runtime bridge test now creates six local Parquet records with the full selected-field input shape. The fixed streaming query yields exactly three: open, unreported-status and temporarily closed U.S. rows. A permanently closed row, a foreign-only row and an addressless row are excluded. A foreign address preceding the U.S. address does not displace the first matching U.S. address.

Assertions compare the exact selected-field inventory, preserve status values and source fields, check numeric coordinates, and reject leakage of deliberately added geometry, bounding-box and contact/social columns. The existing normalizer then produces separate `zip_code: "00501"` and `zip4: "0123"` fields while preserving the source postcode. It retains the distinction between source-reported operation and verified active business: no commercial-business assertion is added.

The test uses the existing verified httpfs runtime, local loopback bridge, injected transport, journal and bounded gzip writer. No external asset or dependency is downloaded. This is synthetic data through a native engine, not proof that the current remote schema or national coverage is complete.

## Remaining work and rollback

The production preparation command still uses its original direct remote path; it has not been enrolled as a governed acquisition worker. Next combine fixed query construction with retained-runtime admission, contained engine/spill limits and final operation/output receipt verification. Large acquisition remains off. No business release or production pointer changes in this refactor. Rollback is a code-only revert of the shared-query refactor and tests; retain all datasets and app receipts.

## Release evidence

Four focused checks passed: three query-contract tests and the expanded native integration. Full `npm run check` passed with 1,627 tests: 1,616 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-streaming-query-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected production pins remained unchanged. The idle development service was stopped for verification and restored afterward; no managed source acquisition was dispatched.
