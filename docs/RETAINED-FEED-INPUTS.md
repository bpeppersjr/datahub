# Typed retained childcare feed inputs

The managed collection plan/start interface accepts optional `retainedInputs`, keyed by explicitly selected source IDs. Supported IDs are `state-{pa,ct,md,vt,co,ia}-childcare-centers`; each remains bound to its existing fixed state CLI. This is local reprocessing of retained evidence, not a new collector or fresh acquisition.

Each entry has exactly five fields:

```json
{
  "kind": "childcare-acquired-manifest-v1",
  "manifestPath": "<absolute canonical datahub/data acquisition manifest.json>",
  "manifestSha256": "<lowercase SHA256>",
  "appReceiptPath": "<absolute canonical datahub/data parent receipt.json>",
  "appReceiptSha256": "<lowercase SHA256>"
}
```

The explicit parent pin is necessary: Iowa acquisitions are stored independently of app run directories, unlike the other five nested acquisition layouts. No filename inference or mutable enrollment lookup is used as execution authority. Existing reporting enrollments provide reviewed initial parent references but are not changed by this feature.

Managed planning and CLI planning replay the retained parent through the source-specific app verifier, including its acquisition, normalization and configuration contracts. Execution rechecks before admission, immediately before the child, and after completion. The parent acquired descriptor must match the input path/hash exactly. Parent and acquisition files are bounded, single-link, non-symlink, stable reads. Invalid evidence fails without acquisition fallback.

The industry CLI forwards the map using `--retained-inputs-json <JSON>`. The fixed source CLI receives only its existing `--acquired <manifestPath>` option, alongside run-scoped `--output`. Plans/fingerprints and receipts retain both pins. Omitted retained inputs preserve legacy plan shape and behavior; selected sources without a retained entry retain their existing acquisition behavior. Use only retained-selected sources for a fully offline operation.

Retained reuse creates a new local normalized output. Consumers that merely promote or report existing normalized releases should consume those releases directly, without rerunning this feed. Original observations, unknown fields, separate ZIP5/ZIP4, source-mode distinctions and policy restrictions remain unchanged. No schedules, production pointers, approval policies, retries, or concurrency guarantees are added.

Focused tests cover six allowlisted dispatch shapes, strict schema/legacy compatibility, Iowa's independent acquisition layout, and Connecticut synthetic app lineage through real supervisor/source CLIs with inherited fetch denial. Synthetic evidence remains synthetic; these tests do not establish six fresh acquisitions or source readiness.
