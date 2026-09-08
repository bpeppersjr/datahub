# Manual source selection

Manual collection planning and dispatch accept optional `sourceIds` alongside `industries` and `states`. For example, a plan request to `/api/data-operations/plan` with the following body selects only registrations:

```json
{"industries":["construction"],"states":["MN"],"sourceIds":["state-mn-contractor-registrations"]}
```

The same body on `/api/data-operations/collections` explicitly starts acquisition. Planning does not acquire data. Existing loopback authentication and operation reservations still apply.

The industry CLI equivalent is `node scripts/run-industry-segments.mjs plan --industry construction --state MN --sources state-mn-contractor-registrations`. Change `plan` to `run` only for an authorized acquisition. `--sources` accepts a comma-separated list once; empty, duplicate, unknown, unrelated-industry and state-inapplicable selections fail before execution.

Omitting the selection preserves the previous industry plan and fingerprint. Manual selections are persisted and forwarded to the child; only selected source/executable locks are reserved, while the managed operation still uses its existing global slot. Schedules remain industry/state scoped and do not accept source selection.

This is explicit selection, not automatic retry, checkpoint recovery, freshness detection or skip-success behavior. Selecting registrations excludes the residential builder but does not diagnose or repair a failed registrations acquisition. Retained successful data should continue to be reused independently.

This increment exposes programmatic API and CLI selection only; it does not add a source picker to the dashboard. Plan `gaps` continue to describe configured state-source gaps, not all sources omitted by a manual selection. Inspect `sourceIds` and `tasks` for the actual selected execution scope.
