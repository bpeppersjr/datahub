# Maryland standalone collection handoff

Co*Tive's `state-md-childcare-centers` industry source runs Maryland acquisition and offline normalization without requiring Codex or ChatGPT. Its fixed scope is the public dataset's licensed Child Care Center cohort dated February 13, 2026. These are source candidates, not verified current businesses, physical premises or national completeness.

```powershell
node scripts/build-md-childcare.mjs
node scripts/build-md-childcare.mjs --acquired <absolute-retained-acquisition-manifest>
node scripts/verify-md-childcare-app.mjs --receipt <absolute-app-receipt>
```

The first command starts native collection. The second independently verifies and reuses retained acquisition without a source request. Optional `--output` stays inside datahub. All jobs retain immutable start, acquired, normalized and terminal receipts, and successful CLI completion independently verifies both child releases. Recorded native mode remains distinct from test transport and is not independent network attestation.

Native acquisition holds a publisher-wide lock at `data/business-sources/md-childcare/runtime/publisher.lock`, including across different output roots. Unknown ownership is not stolen. Retained and injected-test jobs do not occupy this native publisher lock. An output-root lock separately protects each job workspace.

The app requires at least one billion observed free disk bytes and has a cooperative 30-minute deadline. Native acquisition retains its own serial pacing, 220-request/150-million-byte limits, 100-ID batches, 30-second request deadlines and 15-minute acquisition deadline. Managed source/supervisor cancellation grace remains 60/75 seconds. These are safeguards, not resource reservations or permission to exceed provider rates.

Completed child releases survive failed or cancelled control outcomes. Native/test jobs cannot borrow children from another job; retained mode pins its explicitly selected acquired release. Terminal publication is last, and uncertain output requires inspection rather than an automatic retry. No automatic restart or recurring schedule is enabled by enrollment.

## Managed app dispatch

Use the authenticated local collection plan and dispatch with all three selectors:

```json
{"industries":["childcare"],"states":["MD"],"sourceIds":["state-md-childcare-centers"]}
```

The plan must resolve to exactly one Maryland task with the six prerequisite configurations. The accepted application operation ID and persisted managed receipt establish handoff—not an agent promise or source-file presence. After accepted dispatch, agents return to development rather than polling ordinary download progress.

ZIP5 and ZIP4 stay separate, with ZIP4 unavailable from this source. Geocodes are nullable provider-returned latitude/longitude. Missing attributes, reported-state conflicts and oversized-row quarantine remain visible; repeated licenses are not merged. See [normalization boundaries](MD-CHILDCARE-NORMALIZATION.md).

App enrollment and local artifacts do not update national reporting or current-source pointers. The state-access ledger therefore keeps Maryland coverage unmeasured until verified local or national reporting integration. Rollback disables this source entry for future work while preserving receipts and releases.

## Accepted application handoff

Implementation commit `82dd0d0` was pushed before dispatch. The authenticated plan resolved exactly one Maryland childcare task with all six prerequisites. On September 8, 2026 at 19:38:30.221 UTC, the collection API accepted operation `1009c617-581f-46a5-a500-86acbb0fb88d` (HTTP 202). The immediate persisted receipt at `data/managed-operations/1009c617-581f-46a5-a500-86acbb0fb88d/receipt.json` recorded RUNNING, supervisor PID 28520 and worker PID 29672. Its handoff-time SHA-256 was `8cdf3cf6c890586cc68610a3d68238e227f6489f9233e4a66f3f5f32fb5ee9e6`; this managed receipt evolves as the app runs and is not a terminal artifact pin.

No retained Maryland acquisition was found before this first dispatch. Co*Tive owns the download and normalization from this point; no routine Codex progress polling is scheduled. This records acceptance only, not completed acquisition, verified row counts, reporting enrollment or national promotion. The app must remain running; this enrollment does not add automatic restart or recurring refresh.

## Verification — September 8, 2026

Full repository check passed: 1,294 tests, 1,283 passed, 11 skipped, zero failures, plus lint, web/desktop builds and desktop control-plane smoke. TypeScript checking passed; production dependency audit reported zero vulnerabilities; all 82 pending production file pins remain unchanged. The first full run encountered the existing development-supervisor 20-second startup timeout. Its unchanged isolated rerun passed, as did the unchanged full rerun; no timeout or concurrency settings were weakened. Logs are retained locally at `data/tmp/md-childcare-app-full-check.log` and `data/tmp/md-childcare-app-full-check-2.log`.
