# Oklahoma childcare spatial search inventory

This is an implemented offline inventory, not a production dispatch plan or a statewide collector. It performs no downloads, changes no production pointers, and grants no source-use or dispatch authorization.

## Standalone use

From the datahub directory, run:

```powershell
node scripts/inspect-ok-childcare-spatial-inventory.mjs --summary
node scripts/inspect-ok-childcare-spatial-inventory.mjs
```

The second command emits all candidate query records as JSON. Both commands read retained, immutable inputs and write only to standard output. No Codex, credentials, browser, scheduler, or running management server is required. Unknown CLI arguments fail rather than widening scope.

## Verified native result

The September 10 execution verified the pinned Census crosswalk manifest and the 65,631-row relationship artifact, then independently replayed the native Oklahoma retained search bundle. Input paths and SHA-256 values are recorded in `OK_SPATIAL_INPUTS` and included in the command output. Changed or missing evidence fails closed; it does not trigger reacquisition or fall back to fixtures.

The complete deterministic inventory, serialized with `JSON.stringify(result)` (no whitespace or trailing newline), has SHA-256 `9d092a63b81c6270dc47d08af13c9af9d5e85b80c82a55bddb7d1989a69f6281`. This identifies the locally derived result, not an independently authenticated publisher release.

| Measure | Count |
| --- | ---: |
| Oklahoma-intersecting Census ZCTAs | 769 |
| Material-intersection candidates | 667 |
| Sliver-only candidates retained for review | 102 |
| Material candidates intersecting multiple states | 4 |
| Linked retained searches | 1 |
| Source records in that retained search | 4 |
| Material candidates without linked searches | 666 |
| All candidates without linked searches | 768 |

Material means at least one Oklahoma county intersection has raw ZCTA area share >= 0.001, matching the retained crosswalk rule. Multi-state candidates include 66778, 71937, 71953, and 73949. Dominant-state filtering would incorrectly remove three of these candidates. Sliver-only relationships are preserved separately rather than silently dropped or treated as equivalent evidence.

ZIP 73102 links to operation `a5f5ca7d-89b7-450a-9278-3430b436aff6`, observed on September 10, 2026. Its four source rows are retained internal candidates, not four independently confirmed active businesses. Neither a short response nor a zero response would establish search completeness.

## Semantics and remaining implementation

- This is the Census statistical spatial denominator accepted for the project, not a complete operational USPS ZIP universe. No extra USPS prerequisite is imposed on using Census geography.
- Query identity is shared per source/facility type/ZIP, independent of county or state overlap. Each ZIP appears once.
- `zip5` is a five-character string and `zip4` is a separate null field. An area query does not establish an address ZIP+4.
- `not-queried-in-this-inventory` means no linked acquisition in these pinned inputs, not that the app has searched every historical artifact and found none. Unqueried row counts remain null, not zero.
- Polygons are never used to assign a business address, county, or state. No business geometries are added.
- Search progress is not a percentage of national or statewide businesses covered.
- The existing fixed-73102 collector is unchanged. A successor must implement multi-ZIP acquisition, request limits, durable per-query recovery, evidence reuse and app handoff before statewide dispatch. This inventory must not be presented as that capability.

## Verification

Five focused tests pass with `DATAHUB_TEST_OK_SPATIAL_INVENTORY=1`, including a real offline replay. Tests cover cross-state selection, sliver retention, ZIP query deduplication, separate postal fields, invalid types, contradictory flags, duplicate relationships, and pre-read cancellation. Without the native evidence flag, the native test is explicitly skipped; synthetic tests do not prove native acquisition.

Full `npm run check` passed: 1,749 tests, 1,738 passed, 11 explicitly skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. The available PDF, IA reporting, retained-cohort, Overture runtime and Oklahoma inventory native-test flags were enabled. Log: `data/tmp/ok-spatial-inventory-check.log`. Separate `npx tsc --noEmit` passed and `npm audit --omit=dev` reported zero vulnerabilities.

No new source observations, public exports, production promotions, or complete-coverage claims result from this change. Rollback consists of removing this additive inspector and module; retained evidence and production pointers are unchanged.
