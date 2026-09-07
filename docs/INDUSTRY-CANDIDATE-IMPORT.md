# Industry candidate import

`scripts/import-industry-candidate.mjs` admits one already-built, independently verified industry release to its isolated normalized-postal candidate source. It performs no downloads, rejects a production source pointer as input, and never writes a production pointer.

Only `nyRetailFoodStores`, `caAbcActiveLicenses`, and `waLniActiveContractors` are accepted. Their dataset identities, verifiers, publishers, and candidate roots are fixed by code and `config/migrations/normalized-us-postal-fields-v1.json`; the CLI has no output-root option. The operator must pin the exact source pointer, release ID, and manifest SHA-256:

```powershell
node scripts/import-industry-candidate.mjs `
  --source-key nyRetailFoodStores `
  --source-pointer data/industry-refresh/retail-consumer/NY/ny-retail-food-stores/current.json `
  --expected-release-id ny-retail-food-stores-20260907-134303353Z-c3167a89 `
  --expected-manifest-sha256 <independently-recorded-lowercase-sha256>
```

The import verifies the original release, copies only `manifest.json` and its declared regular-file artifacts to an exclusive `.staging/<original-run-uuid>` directory, and verifies every byte and checksum again. It snapshots the prior candidate pointer and rejects drift immediately before publication. The connector's normal publisher then verifies staging, renames it to the immutable `releases/<original-release-id>` destination, and atomically replaces only that candidate's `current.json`. The published manifest must remain byte-identical to the pinned source manifest.

Cancellation is cooperative while validating and copying. A per-source exclusive lock spans pointer snapshot, verification, copy, publication, and receipt creation; other builders must not write the same candidate root outside this lock. Once the final publisher begins, it is allowed to finish its short atomic publication sequence; interruption is not injected between release rename and pointer rename. A failed or cancelled copy remains isolated in staging for diagnosis and makes a retry with the same run UUID fail closed until an operator inspects it. Existing staging or release destinations are never overwritten.

Every completed attempt after candidate-root validation writes an exclusive receipt below `data/migrations/normalized-us-postal-fields-v1/import-receipts/<source-key>/`. Receipts contain hashes, paths, and identities, not child logs or source records. If publication was attempted but its final verification or receipt aftermath fails, the receipt says `published-unverified` and records the observed pointer/release state; the tool never invents a pointer rollback. The lock records the import ID, process ID, and start time. A hard shutdown can leave that owner lock, staging data, and no terminal receipt; automatic stale-lock recovery is intentionally unsupported, so an operator must inspect ownership and artifacts before any manual cleanup. A success must be followed by the connector verifier against the new candidate pointer and `npm run postal-migration:candidates`; all 25 sources must remain ready before any downstream rebuild or cutover is considered.

## September 7 live verification

The three imports ran concurrently and completed successfully between 14:35:45 and 14:36:25 UTC. Independent post-import connector verifiers checked all 50 declared artifacts: New York 7, California 22, Washington 21. Each candidate manifest remains byte-identical to its September 7 refresh. Washington still publishes organization/mailing-address evidence with null physical-site and establishment counts.

Local immutable receipts under the `import-receipts` root above:

- `nyRetailFoodStores/5f5bcf62-2bac-4f6f-85f3-0cc01c2e9f0d.json`
- `caAbcActiveLicenses/4200721d-d96e-4cce-bb5a-aad5ea4d2549.json`
- `waLniActiveContractors/378feede-7acb-4893-b243-33f398453aea.json`

The strict candidate readiness check exited zero: 25/25 ready, all 25 candidate-scoped, zero blocked or rebuild-required, readiness-plan SHA-256 `28c94c799bf9faf21875180d576b2bc89c278574ad94a08a97cfd8a03b5b6f49`. This is a readiness hash, not a cutover execution hash. All 25 production source pointers and four production downstream pointers were compared before/after and remain unchanged. The portable [evidence record](INDUSTRY-CANDIDATE-IMPORT-EVIDENCE-2026-09-07.json) retains their hashes.

Verification passed 385 repository tests (including nine import regressions), lint, web/desktop builds, desktop control-plane smoke, TypeScript checking, and the production dependency audit with zero vulnerabilities. The national registry reconciliation remains a separate live process; candidate preparation does not establish downstream readiness or authorize skipping its dependency verification.
