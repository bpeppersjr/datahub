# Oklahoma batch approval

The user instructed: "Approve the new production plan". On 2026-09-10, the operator recorded this approval for the pending app-connected Oklahoma childcare batch, not a repeat of the already completed production reconciliation.

- Approval ID: `78ec4fe1-dac0-40e9-aac7-e5672f67f7fe`.
- Approval time: `2026-09-10T17:14:56.076Z`.
- Verified plan SHA-256: `e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122`.
- Scope: 666 new center-only ZIP searches; reuse retained ZIP 73102 evidence.
- Limits: 1,998 requests; 1,998,000,000 accepted decoded bytes; 4,662,000,000 result-storage bytes; 4,930,435,456 free disk bytes including reserve; eight-hour deadline. These are not a RAM allocation.

The approval is stored in `config/source-approvals/ok-childcare-zip-batch.json`. This supersedes the pending-approval status in the historical [app handoff report](OK-BATCH-APP-HANDOFF-2026-09-10.md). Its source restrictions and native positive-path verification gaps remain applicable.

Recording approval does not dispatch a job, enable a recurring schedule, authorize automatic retries, change national production pointers, or establish a publisher bulk license. No acquisition was launched as part of this approval-only action. The standalone app can use this approval for the explicitly selected source; its existing scope, resource, cancellation, and retained-output checks remain in force.

To withdraw approval before further queries, set the approval status to `revoked`. Preserve the approval identity and any retained output; do not create a replacement identity to bypass interrupted-query inspection.
