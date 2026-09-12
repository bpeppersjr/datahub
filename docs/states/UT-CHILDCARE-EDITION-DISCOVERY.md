# Utah childcare edition discovery service

This standalone app-owned service discovers an explicitly requested report edition from the official Utah DHHS reports index. It does not acquire a PDF, normalize providers, update the existing 422-center cohort, or change production pointers. No Codex process is required to run the CLI. Queue, scheduling and UI registration are separate integration work.

## Source contract and evidence

The official [reports index](https://dlbc.utah.gov/information-for-the-public/reports/) advertises “Regulated child care programs.” The [Utah disclaimer](https://www.utah.gov/support/disclaimer.html) describes conditional informational/personal use; it is not a blanket derivative redistribution grant. Discovery evidence stays internal, with publisher attribution and no automatic purge. No cookies, credentials, arbitrary URLs or redirects are supported.

One bounded metadata-only inspection on 2026-09-12 returned HTTP 200, 105,120 HTML bytes, SHA-256 `8b704f6c600d5a217f3b956f8e18d8ccf3e01985a6b8d5c9a67ba2708a468985`. It linked the same September-2026 PDF already retained. This inspection preceded the service implementation; it is not a native service receipt. No repeated live request was made merely to manufacture implementation evidence.

The retained baseline URL is `https://dlbc.utah.gov/wp-content/uploads/All-Child-Care-Licensing-Facilities-Report-September-2026.pdf`. Existing PDF SHA-256 `85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa` and 422-center adoption remain untouched. A same-URL index response cannot establish that the PDF bytes are unchanged or current. Discovery does not revalidate or authorize reuse of a particular retained artifact; the existing retained-source verifier remains responsible for that proof.

## Execution

From the datahub root:

```powershell
node scripts/discover-ut-childcare-edition.mjs --edition September-2026
node scripts/discover-ut-childcare-edition.mjs --verify "C:\absolute\datahub\data\business-sources\ut-childcare\edition-discovery\jobs\<UUID>\manifest.json" --sha256 <manifest-hash>
```

The edition is required and closed to English `Month-20YY`; there is no implicit latest edition. Only an actually linked, exact publisher-hosted report path is accepted. Multiple linked editions require explicit selection; a missing requested edition fails without downloading or guessing. The two successful discovery outcomes are:

- `retained-reference-still-listed`: only the baseline link remains advertised. `pdfBodyRequiredBeforeAdoption:false` means no *different-edition candidate* has been discovered; it is not permission to assert a refresh or bypass retained evidence verification.
- `different-edition-candidate`: a different explicit edition is linked. PDF contents, field conformance, source-use applicability and retained adoption are still unverified. A later bounded source-acquisition lifecycle must validate that candidate before any provider refresh.

Both outcomes have `pdfContentsVerified:false`, `sourceFreshnessVerified:false`, no provider publication and no current-operation/completeness claim. Native receipts identify transport performed by the fixed fetch implementation; offline verification rechecks retained evidence, not current publisher state. The CLI verifier explicitly reports `sourceRequestThisRead:false`.

## Bounds, ownership and durable evidence

Version `ut-childcare-edition-discovery@1.0.0` performs at most one GET to the fixed index, with 1 MiB aggregate response cap, 20-second request timeout and 60-second job deadline. One source-wide filesystem lease uses budget key `utah-dlbc-reports-index`. Zero retries, zero redirects, parallel request capacity one. The policy JSON is checked against the closed source contract before the request; its exact bytes are retained as an internal artifact.

Configured policy identity and hash are rechecked before publication. Lease removal requires the exact originally serialized lease bytes as well as stable file identity; same-inode payload replacement is preserved for inspection. The public verifier accepts only a signal option and applies its own fixed 60-second cooperative deadline.

Run paths are immutable UUID directories under `data/business-sources/ut-childcare/edition-discovery/jobs`. Intent and request records precede network access. Completed index bytes are retained even if HTML/edition validation fails, with internal byte/hash descriptors in `failure.json`; incomplete buffers are not published. A successful receipt includes index hash/bytes, explicit selection, policy evidence and historical transport claims. `manifest.json` is published last, only after an independent bounded verifier passes, then verified again. The reader rehashes/rechecks file and directory identities before returning. It makes no source requests.

Complete bounded HTTP-rejection bodies are also retained before status/media-type rejection, without following redirects. Failure receipts record response status, expected-media-type match, bytes and hash; no response headers or cookies are logged. The original checked policy artifact is preserved on failure. Over-cap or incomplete response buffers are not saved as complete source evidence.

SIGINT/SIGTERM/IPC cancellation is handled by the shared CLI cancellation mechanism. Cooperative cancellation releases the lease and records failure status CANCELLED. Noncooperative transport/body cleanup is raced against a one-second cleanup bound, and unresolved ownership retains the lease with explicit inspection-required recovery. This intentional quarantine prevents overlapping publisher requests; it is not an automatically recoverable cancellation. Late responses are disposed, but never automatically release the quarantined lease. Restart never takes over an existing lease or retries a failed run. Post-publication and lease-cleanup failures preserve manifest/run identity with `inspectionRequired:true`; uncertain publication must be inspected before any new action.

## Verification and integration boundary

Focused synthetic tests exercise fixed request options, receipt replay, hostile/missing links, status/type/size rejection, complete-byte retention, caller cancellation, noncooperative cleanup, late response disposal, simultaneous/foreign leases, publication recovery and tampering. Fixture output is restricted to `data/tmp/ut-childcare-edition-discovery`; native verifier rejects fixture paths and mode. Tests prove caller-abort races, not actual 20/60-second timer expiry. No native service run or PDF download is claimed.

The final focused suite has 16 passing tests, including same-inode lease replacement, policy mutation, rejected-response retention and offline CLI validation; focused lint passed. Fixture policy mutation uses a separate fixed `.fixture-policy.json` under the fixture data root, never modifies the real policy configuration, and never enters the native path. Full application checks remain the integrating agent's responsibility.

The app integration should dispatch this CLI with a closed edition field and retain its receipt descriptor, then independently verify it. It must not mark the Utah acquisition refreshed from an index success, automatically dispatch a PDF candidate, reset existing source holds, or replace the original 422-row reporting enrollment. A future acquisition adapter must consume a verified candidate plus its own policy/schema/byte evidence; discovery alone supplies none of those provider-level assertions.
