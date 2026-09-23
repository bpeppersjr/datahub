# Retained organization ZIP evidence consumer

The consumer is pinned to the immutable `broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2` release and manifest SHA-256 `ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e` by `config/broad-organization-zip-evidence-selection.json`. It never follows or changes a current pointer and is not added to the generic flat-export profile selector.

The authenticated `GET /api/business-map/organization-zip-evidence` accepts one exact `zip` (five digits), required `policy_mode` (`public-only` or `local-review`), optional `publisher_state` (CO, CT, DE, FL, IA, NY, OR, PA), `limit` (1–100), and an opaque cursor bound to the release, manifest hash, selected shard hash, filters, and page size. Repeated, unknown, missing, or malformed options fail closed. The reader permits one physical shard scan at a time and at most 16 bounded waiters. Each scan is also bounded by a two-gigabyte compressed artifact ceiling, a twelve-gigabyte decompressed shard ceiling, a two-megabyte JSONL-line ceiling, the retained global row limit, and an elapsed-time limit. The selected complete prefix shard is streamed, strictly UTF-8 decoded, decompressed, parsed, counted, and re-hashed before the response is returned. Client disconnect cancellation stops the stream.

Projection allowlists only the source name, one reported address, publisher jurisdiction, address state, ZIP5 and ZIP4 separately, source status, available source dates, transformation/provenance, and policy context. The full normalized `source_record` never leaves the reader. Publisher jurisdiction remains separate from the reported address state; Oregon assumed-business-name rows remain `brand` rows. All rows are administrative address assertions, not physical sites, active operations, unique businesses, or USPS-valid locations, and never contribute to general business or site totals.

`public-only` omits Delaware record details and returns only an aggregate number of ZIP-matching Delaware rows withheld by policy, labeled as a policy exclusion rather than missing or zero evidence. No Delaware names or addresses are returned. `local-review` can return only the minimized Delaware projection and explicitly labels the local-review-only restriction. Use that mode only within an authorized local review.

The Heatmap's separate “Organization addresses reported at ZIP5” panel appears beneath the exact-ZIP inspector. It supports publisher and policy filters, bounded pages, and stale-request cancellation. It is not a polygon/map layer, coverage denominator, or business/site count.

## Run-scoped export

The separate JSONL/CSV export consumes the same reader and projector, creates a UUID-scoped output directory under `data/exports/organization-zip-evidence/jobs/`, writes one or both minimized formats, then publishes `manifest.json` last. Its verifier re-streams the pinned source and compares every exported row, artifact checksum, and count. Cancellation before publication removes only owned staging files; completed output has no mutable pointer.

```powershell
npm run broad-org-zip:export -- --zip 12345 --policy-mode public-only --format both
npm run broad-org-zip:export:verify -- --manifest <manifest.json> --sha256 <manifest-sha256>
```

The managed data-operations UI was not extended: its existing specialized export branch is specifically bound to Minnesota credential fields and policy, while the generic exporter is category/profile driven. Adding this publisher-address export there would couple a separate private-by-default/local-review policy and paging contract into those existing schemas; the standalone run-scoped lifecycle avoids broadening them. This is intentionally deferred rather than routed through generic profile artifacts.
