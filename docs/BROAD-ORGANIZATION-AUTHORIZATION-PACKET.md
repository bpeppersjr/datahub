# Broad-organization authorization packet

This is an offline review packet derived only from an independently verified release of the broad-organization acquisition backlog. It selects exactly the ten jurisdictions in that backlog manifest's first wave. It preserves the backlog manifest and artifact SHA-256 values, catalog lineage, each assessment's provenance and full assessment snapshot, publisher/product/access/price information, official URLs, privacy exclusions, legal-status/address limitations, and unresolved gates.

Every unresolved gate receives a deterministic, non-row-bearing request specification with an evidence type and acceptance criterion. “Request item” describes information needed for future review; it does not authorize contacting a publisher. Each item explicitly prohibits contact, download, payment, records requests, row-bearing preflight, acquisition, and production changes. No external action is performed by building or verifying this packet. It grants no acquisition authority and does not broaden any assessment authorization.

Build and verify locally:

```powershell
npm run broad-org-authorization-packet:build
npm run broad-org-authorization-packet:verify
```

If more than one immutable backlog release exists, select the exact source release explicitly:

```powershell
node scripts/build-broad-organization-authorization-packet.mjs --backlog-manifest data/broad-organization-acquisition-backlog/releases/<release-id>/manifest.json
```

Packet releases are written beneath `data/broad-organization-authorization-packet/releases/<release-id>/`, using owned staging, manifest-last writes, verification, and atomic directory rename. Output must remain beneath canonical `APP_ROOT/data` without symlink or junction ancestry. No mutable current pointer is created. The verifier re-verifies the source backlog and exact first-wave selection, binds both source hashes, recomputes the packet and manifest, checks authority boundaries, and rejects unexpected release contents.
