# Minnesota credential reporting input

The retained construction cohort now has a versioned, replay-verifiable **credential reporting** dataset. This is a distinct input type for future national consumers; it does not reuse childcare's physical-site projection, participate in identity matching, or change the current national registry. No new source requests are necessary.

## Standalone operation

```powershell
node scripts/build-mn-credential-reporting.mjs --receipt <retained-app-receipt>
node scripts/build-mn-credential-reporting.mjs --verify <returned-manifest>
```

These commands run without an AI session. Builds default to `data/credential-reporting/mn-construction/<UUID>`; `--output` selects a separate app-contained output root. Every build creates a new immutable derivative rather than overwriting source evidence or a current pointer. Do not run a source collection to rebuild this reporting input. Verification is offline and requires the original app/acquisition/selection chain to remain installed.

`loadMnConstructionCredentialReportingInput` verifies the complete retained app and parent acquisition chain, bounds normalized input to 100 MB and 250,000 rows, checks source hashes/counts and observation time, derives distinct reporting identities, then rechecks the app chain. Completed acquisition retained by a failed/cancelled app job may qualify; the original status remains visible. Unverified partial acquisition does not qualify.

`projectMnConstructionCredential` preserves the complete normalized record inside a `mn-construction-credential-reporting@1.0.0` envelope. Its reporting ID hashes source release and source-row ID. Two rows with the same license are **not** merged. The pure structural validator cannot authenticate source membership by itself; the verified loader supplies that boundary.

## Publication and interpretation

Each `mn-construction-credential-release@1.0.0` directory contains exactly `credentials.jsonl` and `manifest.json`. The manifest binds the original source receipt, summary, count, bytes and checksum. Publication replays every generated row against verified input before a no-overwrite, manifest-last commit. Normalized input and output remain local-review-only; names and addresses are not committed to Git. Output is capped at 150 MB. This is a bounded in-memory loader, not a streaming unlimited national build or a memory reservation.

The verifier rejects additional artifacts, linked files/ancestry, tampered rows or claims, checksum/count differences and a creation time before the verified source job finished. Output cannot be placed inside a source job or manifest-bearing source tree. Cancellation before commit cleans only owned files; ordinary failures preserve incomplete diagnostic evidence. After commit, failures report inspection required and preserve output. Process death between manifest link/unlink is not automatically repaired. No scheduled refresh, source retry, automatic recovery, public export or national promotion is introduced.

The record unit is a publisher business-credential row. Names, DBA, typed credential number, reported address and source dates remain source assertions. ZIP5 and ZIP4 remain separate. Source dates are unparsed credential values, not business lifecycle dates. Observation time is never replaced by processing time. Geocodes remain null because this source supplies none; it grants no county/ZCTA membership, physical-site inference or business polygons. State percentages retain their explicit **accepted-source-cohort** denominator; active-business count and national completeness remain unavailable.

## Actual retained release

Release `30cd9c0e-0a8d-467c-b416-150453e1513f` was built and independently verified on September 8, 2026. Its manifest is `data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json`, SHA-256 `558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75`. It preserves all **11,456** accepted residential credential rows, including the one unavailable ZIP5, from app job `ebfad910-440e-46bb-b42b-2fc44b6d32f3`. The original app receipt SHA-256 remains `ae0dfe3d93e2edf7d19303774b3ac922c9ff423c56d930138fd313d86468e3eb`.

This is completed local reporting-input publication, not completed national integration. The next integration must give registry, coverage, map and export consumers an explicit credential-row evidence type with separate denominators and eligibility rules. It must preserve the current production inputs and never count these rows as newly confirmed businesses.

### September 10 retained-input revalidation and next integration

Implementation update: the [separate national registry and coverage extension](MN-CREDENTIAL-NATIONAL-EXTENSION.md) now consumes this exact retained input in isolated native builder tests. Full repository validation passed with 1,846 tests passed, 11 skipped and zero failures, plus lint, builds and desktop smoke; production planning, promotion and map/export adoption remain pending. The following paragraphs describe the original integration requirements, not a claim that the implemented registry/coverage hooks are still absent.

The standalone verifier was rerun against the exact enrolled manifest on September 10, 2026 and passed, again reporting the same manifest hash and 11,456 credential rows with `national_reporting_integrated:false`. This was offline replay, not a source retry. Parallel coverage triage selected this as the next non-childcare integration workstream: the existing national registry/coverage modules do not yet consume the credential release, while local credential summaries already do.

Add a separately typed, immutable credential reporting extension rather than inserting these rows into childcare or physical-site profiles. Preserve all source-row identities, repeated credential numbers, the one unavailable ZIP5 and separate ZIP4 fields. Report 10,899 MN-reported-address rows and 557 other-state rows using the 11,456-row accepted-cohort denominator; do not claim verified operations in those states. Coordinates remain null, and county/ZCTA assignment, physical-site eligibility and identity matching remain false. The unchanged local-review-only export policy must constrain combined outputs.

Implementation must bind the exact retained manifest/artifact and replay its original app/acquisition chain, then independently verify extension records and national/state/reported-ZIP count conservation. Publication requires a newly reviewed production plan after code validation; do not modify or rerun the completed childcare plan, and do not retry the unrelated failed Minnesota registrations source. The revalidation itself changes no release or production pointer.

Rollback is additive: stop using the new CLI/loader and revert the new modules/tests. Keep the original acquisition and immutable derived releases; no global pointer migration needs reversal.

Validation: five synthetic projection groups cover deterministic source-row identity, same-license separation, postal/date preservation, strict field shapes and rejected claims; one real retained-cohort group covers publication/replay, source protection, tampering, chronology and cancellation; one CLI group covers malformed arguments. The retained-cohort group explicitly skips when its internal fixture is absent and never downloads a replacement. On this machine all seven groups ran. `npm run check` passed with 1,181 tests (1,170 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop smoke. TypeScript passed, the production audit reported zero vulnerabilities, and all 82 pending production code/config pins were unchanged.
