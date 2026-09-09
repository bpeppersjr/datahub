# Source-acquisition prerequisite gates

This module implements an explicit policy hold for the proposed Nebraska childcare PDF workflow and a separate [bounded Oklahoma schema operation](states/OK-MANAGED-SCHEMA-PREREQUISITE.md). It does **not** implement Nebraska PDF capture, a decoder, an acquired roster or an approval UI. The [source review](states/NE-PDF-INTERNAL-USE-2026-09-09.md) identifies a concrete linked-notice scope question; unspecified rights alone are not treated as a statewide prohibition.

## Application contract

- Authenticated `GET /api/data-operations/catalog` now includes `sourcePrerequisites`. Its Nebraska entry is `BLOCKED_SOURCE_POLICY`, with `reasonCode: SOURCE_POLICY_UNRESOLVED`, public evidence links, next action and explicit false capture/acquisition/export/current-operation claims. Existing catalog fields remain unchanged. This is API/catalog visibility, not a newly rendered dashboard section.
- Authenticated `POST /api/data-operations/source-prerequisites` with exactly `{"sourceId":"ne-childcare-pdf"}` returns HTTP 409 with an actionable error message. For Nebraska it does not reserve a managed slot, allocate a run, create a receipt, invoke a worker or request a source. The separate exact `{"sourceId":"ok-childcare-schema"}` input now dispatches only the fixed Oklahoma prerequisite, not a collection.
- Unknown sources, URLs, output paths, approval flags, extra properties and malformed input return HTTP 400; missing authentication returns 401. There is no caller override or fallback to the generic download job.
- Oklahoma adds the `source-prerequisite` operation kind using existing durable cancellation/restart handling. No Nebraska capture kind is enrolled. This gate applies to the proposed source-prerequisite workflow; it is not a claim that every legacy generic URL/job route now enforces a universal source-policy engine.

The gate is code-defined and returns a fresh catalog projection. Changing a catalog result in memory cannot approve a capture. Even a future returning Nebraska assertion cannot cause that branch to dispatch: it refuses unenrolled capture explicitly. A future approved Nebraska implementation needs a reviewed source profile, bounded transport, mixed-content retention controls, decoder prerequisite, immutable source evidence and verified operation handoff before this hold can be replaced.

## Policy decision and next action

DHHS explicitly publishes the free roster. Its linked Nebraska.gov notice limits copying/reuse and automated collection, while the notice's applicability to the separately hosted DHHS document remains unresolved. Preserve both facts. Do not call the document inaccessible, universally prohibited or already approved.

The [clarification draft](states/NE-PDF-CLARIFICATION-DRAFT-2026-09-09.md) is for operator review only; it has not been sent. Source-specific clarification or another recorded, supportable policy disposition is needed before implementing automated PDF-body acquisition. No paid list, contact, agreement or manual-download workaround was used. Other independently authorized sources need not stop because this one is held.

## Verification and rollback

Pure gate tests cover immutable projections, malformed data, symbol fields, accessor rejection, no approval override and fixed errors. Managed tests verify no allocation, receipt, executor, network call or reserved slot. Live isolated HTTP tests cover authenticated 409, malformed 400 and unauthenticated 401. Full release-check evidence is recorded in the roadmap.

Rollback reverts this gate/catalog/route integration; it does not delete any source evidence or introduce a capture implementation. The proposed success-capable dispatch code was removed before release. No Nebraska PDF body or provider dataset was obtained by this change.
