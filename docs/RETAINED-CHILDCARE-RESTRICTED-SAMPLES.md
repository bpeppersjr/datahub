# Restricted retained samples in the local snapshot

Optional `retained-childcare-cohort-snapshot@2.0.0` is an internal local reporting derivative, not a national release. Authenticated `POST /api/data-operations/cohort-snapshots` accepts `{ "includeRetainedSamples": true }`; `{}` retains the unchanged v1 build. Callers cannot override paths, hashes, ZIP or policy. The fixed worker accepts paired CLI flag `--retained-samples true`.

V2 reuses the immutable seven-source snapshot pinned in `RESTRICTED_SAMPLE_INPUTS`, copying its validated v1 view unchanged and adding separately checksummed `restricted-samples.json`. It does not rebuild those sources, change their enrollment or national registry inputs, publish nationally or alter map shading. A v2 artifact cannot satisfy a managed v1 request or vice versa. The strict v1 cohort-view validator still rejects augmented views.

## Evidence and restrictions

Oklahoma supplies four retained records from center-only query ZIP 73102, observed `2026-09-10T16:10:18.534Z`. All four source coordinate pairs are preserved with unknown datum, accuracy and premises association. New Hampshire supplies six retained visible records from query ZIP 03755, observed `2026-09-10T17:57:56.067Z`, with no source points. These are samples, not statewide cohorts or percentages of businesses collected.

The adapter binds normalized manifests and the successful Oklahoma parent receipt with exact hashes. It invokes their offline verifiers and projects saved records without downloading or running normalization again. Names/DBA, source IDs, source address lines, reported ZIP5 and separate ZIP+4, original query ZIP, source URLs, observation clocks and normalization clocks remain distinct. First/last seen describe the observation, not publisher updates. Original normalized sources and upstream provenance remain preserved and hash-linked. Policies remain `ok-public-center-lookup-internal-selected-business-fields@1.0.0` and `nh-childcare-visible-internal@1.0.0`.

Internal export restrictions, no public export, no identity matching, no verified physical-site/current-operation claims, no inferred polygon membership, and unknown statewide/nationwide completeness are enforced. Query ZIP never fills missing address ZIP. The UI separates samples from seven enrolled state-source cohorts used in national reporting. State selection filters publisher scope, address ZIP selection filters reported ZIP only, and county selection implies no county membership.

## Verification and lifecycle

Full reads independently reproduce the complete sample projection from pinned normalized inputs. Rehashing altered names, points, policies, dates or claims cannot pass. The builder verifies before manifest-last publication and the managed parent independently verifies before success. Processing must follow the base snapshot and both normalization clocks. Missing, partial or drifted evidence fails closed, not as measured zero.

The enrollment reader checks the pinned successful parent receipt and derivative hash before `verifyRestrictedSources: false`, a cheap integrity/structural read. It truthfully reports no source replay on that UI read. This option is only appropriate with independently trusted manifest pins; caller-provided hashes are not authenticity evidence. V2 parent receipts record source projection replay during acceptance. Read endpoints never start operations.

V2 retains existing ownership, bounded writes, exclusive lock, inode-aware cleanup, manifest-last publication and committed-descriptor recovery. Pre-publication cancellation cleans only owned unpublished outputs. Late cancellation preserves committed evidence and cannot turn a cancelled operation into success. No retry, schedule or download is enabled.

## Installed derivative and validation

App-owned operation `86c727ff-e93d-42d0-9a05-9aab9a81c365` succeeded after authenticated dispatch at `2026-09-12T01:04:24Z`. Receipt: `data/managed-operations/86c727ff-e93d-42d0-9a05-9aab9a81c365/receipt.json`, SHA-256 `1f07e33615bfe807bca433c6f697ff54e22301859db0034db5dbdfda12963696`.

Manifest: `data/managed-operations/86c727ff-e93d-42d0-9a05-9aab9a81c365/output/jobs/ce83b580-b828-4af2-aab4-63bbd37d717c/manifest.json`, SHA-256 `2e6c4d4c45b0c0baa7ead2f97c50e783642dc029c4ee5599b98c8c41559c2d63`. Source cohort availability stays 7/7; samples remain separate 4 + 6 and never enter national totals. Only local snapshot enrollment changed. Runtime data and screenshots stay outside Git.

Focused tests: 25 passed, zero failed, one legacy opt-in skipped; new installed sample test explicitly enabled. TypeScript and desktop build passed. Electron verified both groups, expanded source fields and 200% text with no sample-panel horizontal overflow (client/scroll width 1126px, body 28px, heading 30.4px). Screenshot: `data/ui-verification/restricted-samples-200.png`. Text size was reset to 100%.

Full-check command: `$env:DATAHUB_TEST_RESTRICTED_SAMPLES='1'; npm run check`. Log: `data/ui-verification/restricted-samples-full-check.log`. Final counts are reported in the release handoff after completion. Older optional private/native test inputs are not newly enabled.

Rollback restores local enrollment operation `bafb683b-f4ae-4355-983a-d2a3c85e7d9b` and receipt SHA-256 `5de68167b873461bc37c6fe7fcff19dc5d920c4b332370dbd56f91ea323ab7e3`, preserving both immutable snapshots. National pins require no rollback. Implementation used the supported Astra dedicated coding/testing fallback after Spark did not respond. Sites architecture is preserved; no hosted deployment occurred.
