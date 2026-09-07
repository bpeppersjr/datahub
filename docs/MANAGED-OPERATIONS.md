# Managed operations service

`runner/managed-operations.mjs` is the local control-plane boundary for the existing industry collection and flat-business export CLIs. It accepts selections, never script paths, arbitrary output/source paths, environment variables, or command fragments. Child processes use the current Node executable with `shell: false`, hidden windows, bounded captured output, and IPC cancellation. The service permits one active operation in total so the collection runner's internal concurrency cannot multiply through repeated API requests.

Create a service with `createManagedOperations(options?)`. Its methods are asynchronous:

- `catalog()` returns `{industries, states, export}` allowlists.
- `plan({industries?, states?})` returns the canonical `buildIndustryPlan` result without running it.
- `startCollection({industries?, states?})` starts a configured industry run.
- `startExport({categories?, states?, fields?, format?, policyMode?, sourceIds?, outputPrefix?})` starts a governed export. Its source is fixed at `data/business-registry/current.json`; its output is run-scoped under managed storage. `local-review` remains explicit and the export's field-level policy enforcement is unchanged.
- `list()` returns newest operations first; `get(id)` returns one operation or `null`.
- `cancel(id)` requests cooperative cancellation and returns the current operation, or `null`.
- `artifact(id, filename)` returns `{path,name,bytes,sha256,contentType}` only for a finished operation's manifest-declared file after containment and current SHA-256 verification.
- `close()` cancels children owned by this instance and waits for them to exit.

The stable public operation shape is:

```json
{
  "id": "immutable-run-id",
  "kind": "collection | export",
  "status": "QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED | UNKNOWN",
  "createdAt": "ISO-8601",
  "finishedAt": null,
  "error": null,
  "artifacts": [{ "name": "records.csv", "bytes": 123 }],
  "result": {}
}
```

Receipts live at `data/managed-operations/<id>/receipt.json` and are replaced atomically through a serialized write sequence. Run directories are created exclusively. On restart, completed history is loaded. A queued/running receipt becomes failed/interrupted only when both its recorded supervisor and child PID are confirmed absent. Missing, live, or inaccessible ownership evidence is represented in memory as `UNKNOWN`, is not signalled or overwritten, and blocks new work. History refreshes recheck the authoritative receipt and adopt a terminal result written by its owner; otherwise ownership remains unresolved. Child stdout/stderr and environment data are not included in public operation records or errors.

The management page is at `/#data-operations`. Authenticated routes under `/api/data-operations` expose `GET /catalog`, `GET /operations`, `GET /operations/:id`, `POST /plan`, `POST /collections`, `POST /exports`, `POST /operations/:id/cancel`, and `GET /operations/:id/artifacts/:filename`. Invalid selections return HTTP 400 and conflicting starts return 409. Downloads are streamed after verification. The page does not promote isolated source releases into the national views; the registry/resolution/coverage dependency chain remains separate.

Export artifacts come only from the export manifest, plus its publication manifest. Raw/source inputs, collection logs, temporary files, and undeclared paths are never downloadable through this API. Collection summaries expose the selected plan and terminal status but do not publish raw connector artifacts through this management layer.
