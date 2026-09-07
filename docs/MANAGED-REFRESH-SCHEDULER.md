# App-owned scheduled industry refreshes

The local Co*Tive runner now owns a durable interval scheduler. It needs the application service running, not Codex or ChatGPT. Installation creates no schedule and enables no download. The existing Data Operations screen is unchanged; this increment exposes authenticated local API controls.

## Operator controls

All endpoints require the existing loopback control-plane authentication and origin protections.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/data-operations/schedules` | List schedules and their latest occurrence |
| POST | `/api/data-operations/schedules` | Create a schedule, disabled by default |
| POST | `/api/data-operations/schedules/:id/enabled` | Enable or pause with `{ "enabled": true }` or `{ "enabled": false }` |

Example creation body (does not enable execution):

```json
{
  "industries": ["sales-tax-outlets"],
  "states": ["TX"],
  "intervalHours": 168,
  "enabled": false
}
```

Industry and state selections must be explicit and nonempty. Intervals are whole hours from 24 through 8760. This application bound is not independent permission to refresh any source that often: source policy, prerequisites, request limits, and verification still apply. Plan acceptance checks the configured selection; it is not a complete source-content or licensing preflight. The industry worker performs its existing prerequisites and connector checks before acquisition.

Enabling makes the schedule due immediately; the normal local timer checks approximately once per minute. After a successful occurrence is observed, the next due time is that observation time plus the configured interval. Missed intervals coalesce into one attempt rather than a burst of catch-up downloads. A busy managed operation defers dispatch. A paused schedule does not cancel a collection already running; use that operation's existing cancellation control when necessary.

## Durability and duplicate prevention

`data/refresh-schedules/state.json` stores validated schedules and each latest occurrence. An exclusive `owner.lock` prevents a second scheduler from owning the same storage. Updates are serialized, written to a temporary file, synchronized, and atomically renamed. A persistence failure disables further scheduling until inspection; malformed state is not replaced with an empty configuration.

Before dispatch, the scheduler durably records a deterministic operation ID derived from the schedule and due time. Managed operations reserves that exact ID and persists its receipt before launching a child. Replays return the existing operation; existing directories with missing, malformed, or conflicting receipts never cause generation of a replacement ID. The reviewed plan fingerprint is rechecked in the managed dispatcher and in the child CLI after it reloads configuration, before acquisition can begin. Plan changes pause the schedule and require a newly reviewed schedule.

Enabled schedules cannot share a source or executable, including a shared national source selected for different states. Independent source tasks inside one run retain the existing concurrency setting and cross-process source reservations. The scheduler dispatches at most one managed collection at a time. It does not infer that a previous successful download is still fresh for arbitrary future requests, and it does not automatically import or promote refreshed sources into production reporting.

On restart, linked successful operation receipts advance the schedule without replaying them. Failed, cancelled, missing, or ambiguous operations pause for inspection; only an explicitly retryable busy response defers normally. An old timestamp or missing PID does not automatically authorize removal of a scheduler/source lock. A hard termination may therefore require operator investigation. Graceful IPC shutdown in the local launcher releases scheduler ownership; it is distinct from forced Windows task termination.

The schedule record exposes only its latest occurrence. Older executions remain in `data/managed-operations/<operation-id>/receipt.json` and the corresponding immutable industry run records; this is not a separate complete scheduler-history index. Persistent Windows-service installation, automatic stale-lock recovery, configuration editing/deletion, richer schedule history, UI controls, and freshness-based reuse remain follow-up work.

## Verification and rollback

The increment passed 478 repository tests, lint, web/desktop builds, desktop control-plane smoke, TypeScript, and a production dependency audit with zero vulnerabilities. Focused tests cover deterministic dispatch, real child CLI plan rejection, local timer execution, restart adoption, overlap rejection, busy/ambiguous conflicts, storage faults, disabled API creation, authentication, and actual IPC shutdown with ownership cleanup. No production schedules or source downloads were created for this increment; fixture execution is not evidence of a completed live provider refresh.

This is additive and does not migrate existing business data. To stop scheduling, pause configured schedules and stop the application gracefully. Preserve schedule/operation receipts and investigate any retained ownership before downgrading; do not delete locks as a rollback shortcut.
