# Oklahoma batch app connection and approval gate

## Outcome

Co*Tive's existing industry job system now exposes `state-ok-childcare-spatial-batch` for explicit manual selection. Default collection plans and refresh-scheduler plans exclude it. The Data operations page has a source selector, marks manual-only sources, and explains omitted collection gaps.

The app adapter validates a stored approval against the exact worker plan. **Approval is currently pending. No native statewide batch has run.** The native test below proves the rejection path and app receipt, not successful acquisition, source completeness or native resume.

The original completed production reconciliation is unchanged. This is a separate prospective source acquisition, not another promotion or redownload of that production run.

## Current proposed scope

The app-connected revision's plan SHA-256 is `e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122`. It includes 29 implementation/configuration/dependency pins. It supersedes the standalone proposal hash in the preceding worker note; it has not been approved.

The workload remains 666 new center-only ZIP searches, up to 1,998 source requests, reusing ZIP 73102's retained four internal source records. It selects 667 material Oklahoma-intersecting Census ZCTAs including cross-state intersections, with 102 sliver-only candidates deferred. Census spatial search coverage is not a complete operational USPS ZIP universe or complete business coverage.

Budget: at most 1,998,000,000 accepted decoded response bytes; 4,662,000,000 bytes of result-file capacity; 4,930,435,456 bytes of free disk required including reserve. These are transfer/storage limits, not a RAM allocation. There is no enforced total process RAM ceiling. Requests are serial, paced, bounded and not automatically retried. Full budget and source-use limitations are in [the worker scope note](OK-ZIP-BATCH-PROPOSED-SCOPE-2026-09-10.md).

## How the standalone app runs it

1. Review the current plan with `node scripts/collect-ok-childcare-zip-batch.mjs plan`.
2. After explicit authorization, the operator records approval in `config/source-approvals/ok-childcare-zip-batch.json`: exact schema version, `status: "approved"`, a new UUIDv4 `approval_id`, ISO UTC `approved_at`, and the reviewed `scope_sha256`. The checked-in record is pending with null fields. The worker never approves itself. An approval record is the operator's scope acknowledgment, not an independently verified publisher bulk license.
3. In Data operations, select Childcare, Oklahoma, and the manual-only Oklahoma spatial-batch source. Preview then start the collection. The authenticated existing `/api/data-operations/collections` endpoint receives the same explicit source selection. No special Oklahoma server endpoint was added.
4. The industry supervisor launches `scripts/build-ok-childcare-zip-batch.mjs --output ...` with its run identity. The adapter requires the exact source/state output directory under that run and checks approval before creating source output.
5. Every supervisor run under the same approval uses `data/business-sources/ok-childcare/approved-zip-batches/<approval_id>`. It replays completed results or resumes only a never-issued suffix; a new supervisor operation does not create a new batch implicitly.

Approval is rechecked before each new ZIP and after verification. Changing or revoking it prevents the next ZIP; this is not an asynchronous interruption of an already in-flight three-request query. The app's cancellation control provides cooperative interruption. A changed worker/configuration pin requires a newly reviewed scope, not an automatic refresh.

The direct batch CLI retains its existing explicit scope-hash mechanism; it does not require the app's stored approval record. Operators must not confuse that separate manual command with this app gate. A new standalone output directory means a new batch and must not be used as an automatic retry.

## Native rejection evidence

The local authenticated app accepted an explicitly selected operation and its real industry supervisor/child reached the pending-approval gate:

- Operation: `01f3c3bd-68b3-4329-805d-d19d56e951da`.
- Managed receipt: `data/managed-operations/01f3c3bd-68b3-4329-805d-d19d56e951da/receipt.json`.
- Managed receipt SHA-256: `d5c362b87a258afa8eae93145da8284be59a8a60e4e8307f53d803bd657fd839`.
- Terminal status: `FAILED`, expected for this negative test, not a successful collection.
- Industry receipt: `data/industry-segments/runs/01f3c3bd-68b3-4329-805d-d19d56e951da/receipt.json`.
- Industry receipt SHA-256: `7f012bf7ca3f4d887dfbbf49afc1f8b828d6087cc5d1f0f20e7ec8f1a0022469`.
- Exactly one failed guarded task; its log reports missing explicit scope approval. Its source output directory was not created.
- Approval SHA-256 before and after: `b95fb119020357d29bf1f9922b15fc1892aa303a1c9ede7fa595cba07fa4048c`, unchanged and pending.
- A default Oklahoma childcare plan returned zero tasks before this explicit dispatch.

The validation controller and worker acquired no source data. The controller shut down its owned local server after the terminal receipt. Native success, source delivery for the other ZIPs and native interrupted-run resume remain unverified.

## Coverage and tests

The regenerated report is `data/state-access/reports/20260910165222-49853fcf-1d37-4478-8a89-107272b214fd.json`. It covers 51 jurisdictions and 459 industry/state cells: 202 national-dataset state evidence, 187 missing, 57 unmeasured and 13 direct state-publisher cells. Oklahoma moved from missing configuration to configured/unmeasured, not to observed statewide business coverage. Its source metadata includes `manualSelectionRequired: true`.

The ledger projection does not inspect job history or submit work; its `jobSubmitted: false` field is not the status of the native negative-test operation above. Actual dispatch outcome is in the managed and industry receipts. No matching/coverage production pointer changed and no national reporting promotion occurred.

Focused validation passed 81 tests across app gating, industry planning, state-access projection and the batch worker. Cases include pending/stale/malformed approval, wrong output identity, caller hook rejection, cancellation before work, default/manual selection, forged plans, source catalog metadata, and an isolated real child process that exits before source output creation. The positive native adapter path remains untested; these tests must not be used as evidence that source acquisition succeeded.

Final `npm run check` passed: 1,767 tests, 1,756 passed, 11 explicitly skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/ok-batch-app-check-final.log`. Available PDF, IA reporting, retained-cohort, Overture runtime and Oklahoma retained-inventory flags were enabled. Separate type checking passed and the production dependency audit found zero vulnerabilities. An earlier run found one outdated catalog test fixture; it was corrected and the entire suite rerun. The proposal hash was regenerated after the final check and remained unchanged.

## Recovery and rollback

Retained interrupted/rejected intents or unexpected pending files require inspection. Neither a new supervisor run nor a stale/dead PID authorizes repeating a query or clearing publisher exclusions. Completed source projections and receipts are preserved, not rolled back on cancellation.

To withdraw this connection, keep approval pending or revoked and remove the industry enrollment. Reverting the optional manual-selection support or source selector should preserve all retained data and other industry sources. Code rollback is not permission to delete data or clear locks. No recurring schedule has been enabled.
