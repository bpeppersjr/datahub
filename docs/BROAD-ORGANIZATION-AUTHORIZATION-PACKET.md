# Broad-organization authorization packet

The current v2 packet is an offline review artifact derived only from the independently verified v2 broad-organization acquisition backlog. It selects exactly that backlog's current first wave: IL, MS, AR, KY, HI, KS, NV, UT, WA, and OK. Alaska and D.C. remain excluded because their broad layers are admitted in the authoritative matrix. The packet preserves backlog manifest and artifact SHA-256 values, matrix-backed backlog lineage, catalog lineage, each assessment's provenance and full assessment snapshot, publisher/product/access/price information, official URLs, privacy exclusions, legal-status/address limitations, and unresolved gates.

Every unresolved gate receives a deterministic, non-row-bearing request specification with an evidence type and acceptance criterion. “Request item” describes information needed for future review; it does not authorize contacting a publisher. Each item explicitly prohibits contact, download, payment, records requests, row-bearing preflight, acquisition, and production changes. Building and verification perform zero network requests and zero external source actions. The packet grants no acquisition authority and does not broaden any assessment authorization.

Build and verify locally:

```powershell
npm run broad-org-authorization-packet:build
npm run broad-org-authorization-packet:verify
```

The default builder selects the unique verified v2 backlog even while the historical v1 release remains present. An exact v2 source may also be selected explicitly:

```powershell
node scripts/build-broad-organization-authorization-packet.mjs --backlog-manifest data/broad-organization-acquisition-backlog/releases/<release-id>/manifest.json
```

Packet releases are written beneath `data/broad-organization-authorization-packet/releases/<release-id>/`, using owned staging, manifest-last writes, verification, and atomic directory rename. Output must remain beneath canonical `APP_ROOT/data` without symlink or junction ancestry. No mutable current pointer is created. The default verifier selects the unique v2 packet. It re-verifies the source backlog and exact first-wave selection, binds both source hashes, recomputes the packet and manifest, checks authority boundaries, and rejects unexpected release contents. The immutable historical v1 packet remains independently and strictly verifiable by exact manifest path; it is not selected as current and its bytes are not rewritten.

## Read-only management view

The authenticated empty-GET endpoint `/api/data-operations/broad-organization-authorization-packet` independently verifies the canonical immutable packet on every request. Its bounded response contains release and source-lineage identifiers, the exact first-wave jurisdictions, unresolved gates, non-row-bearing evidence specifications and acceptance criteria, privacy exclusions, source-status/address limitations, and explicit false authority flags. It omits filesystem paths, raw assessment snapshots, official URLs, candidate payloads, and every operation or approval control. Query parameters, request bodies, non-GET methods, missing evidence, ambiguous releases, and verification failures fail closed.

The Data Operations page exposes that same projection with a local jurisdiction filter and a recheck button. Recheck only repeats offline verification; it does not contact a publisher, request evidence, download records, grant approval, schedule work, or start an acquisition or production operation.
