# Minnesota construction source-use prerequisite

Implemented September 8, 2026. This is an acquisition prerequisite, **not yet a Minnesota app download operation**. State agents validate source contracts and repair connectors; Co*Tive workers must own subsequent routine acquisition without Codex supervision.

## Evidence and assessment

The [DLI lookup page](https://dli.mn.gov/license-and-registration-lookup) offers construction credential exports. The [DLI disclaimer](https://dli.mn.gov/about-department/about-dli/disclaimer) describes information/documents as public domain while retaining attribution, linking, logo and endorsement boundaries. The conditional internal profile does not accept agreements, grant redistribution, or constitute comprehensive legal approval. Sole-proprietor names and residential addresses remain potentially personal data.

`config/source-policies/mn-construction-internal-acquisition.json` limits the cohort to the two fixed contractor-registration and residential-contractor exports. Only selected business-credential fields may reach durable staging. Raw CSV, contacts and rejected personal values are excluded. An Issued credential is not proof of an active business or a physical operating location.

Native evidence retained locally:

- Receipt: `data/business-sources/mn-dli-construction/source-use/4326f062-55dd-4469-9d4b-0631b9eefe67.json`, 24,814 bytes.
- Receipt file SHA-256: `e7e0f8f7a4c3b9098c8c79fbae18cebd236bdb704e119aeb5673e629170445b8`.
- Disclaimer observed at `2026-09-08T11:39:40.713Z`; lookup observed at `2026-09-08T11:39:41.829Z`.
- Normalized complete-article hashes: `dd26725b6437d753ac3c6edc71049251e7fee3acbe48f96ceda7a1f548e51a87` and `0bdbdb92cec6894c4773b702691bfa5606801291eb5884ee33873cf4e489be5d`.
- Canonical policy JSON hash: `6414af8d16b149d9087ae65cb930556248ce897c0322dd3bf16d003366cdf526`.

The saved capture consumed two HTML responses totaling 55,788 bytes; an earlier exploratory two-page capture was not saved. Neither capture requested CSV rows. Complete article HTML is retained internally, with CRLF normalized to LF; full-page byte hashes are observations only because full pages are not retained. Article navigation and links are included, but content outside the article and external linked pages are not fingerprinted. This is not publisher authentication or a comprehensive terms-change detector.

## Runtime contract

`runner/mn-construction-notices.mjs` performs two serial anonymous fixed-URL HTML requests with one-second pacing, no automatic retry, no redirects, a 15-second per-request deadline, a 1 MB consumed-response ceiling and a 200 KB article ceiling. It rejects ambiguous article structure, unexpected content types/encoding, invalid UTF-8 and length mismatch. Error bodies and unexpected error details are not retained. Deadlines and cancellation cover stalled bodies and injected fetch implementations that ignore signals.

`writeMnConstructionNotices` snapshots the validated receipt, writes an exclusive UUID temporary file under the app, fsyncs and rereads it, then publishes a unique JSON receipt without overwriting earlier evidence. It rejects path escapes, aliases, release/staging ancestry and manifest-bearing ancestors. Cancellation before publication removes only the owned temporary file. Ordinary failures retain partial evidence; automatic crash recovery is not implemented. Publication does not move any production pointer.

The standalone notice-only command is:

```powershell
node scripts/preflight-mn-construction-notices.mjs
```

It is not a download loop or a substitute for app enrollment.

`bindMnConstructionSourceUse(notices, { checkedAt })` independently validates receipt structure, requires evidence no older than 15 minutes and not from the future, and compares both reconstructed article fingerprints against the pinned reviewed policy. Changed articles require review. The immutable returned assessment explicitly keeps dispatch, app enrollment, legal approval, source authenticity and export authorization false. A caller-supplied historical check time is useful for replay, not permission to fetch today.

## Validation and remaining handoff

Eight offline tests cover fixed requests, receipt reconstruction, malformed/oversized HTML, HTTP/encoding failures, no retries, deadlines, cancellation, immutable publication, path boundaries, policy drift and stale/future evidence. Accepted binding was additionally checked against the actual retained native receipt at its recorded finish time, with a same-length article mutation rejected after rehashing. This manual historical replay makes no new requests and does not assert present freshness. Full publisher articles are not copied into public test fixtures.

Run the full check with process-scoped `TEMP` and `TMP` pointing to `C:\Master Data\datahub\data\tmp`: existing tests use the operating-system temporary directory, and production path guards correctly reject their outputs if that directory is outside the app. This does not require a global Windows environment change.

Verification: `npm run check` passed with 1,025 tests discovered, 1,014 passed, 11 skipped and zero failures, plus lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending national memory-plan code/config pins were unchanged. The local web preview was restored after the build.

Next implement native CSV transport tied to current before-row and post-acquisition notice checks, measured source identity, existing streaming selection and independent retained-bundle verification. Then enroll the standalone app worker with cancellation/resource policy and persist an actual operation ID and receipt. Only accepted app dispatch completes handoff; a policy flag alone does not.

No Minnesota full CSV acquisition, app enrollment, refresh schedule, national coverage increase or production promotion is claimed here. Existing verified bundles remain reusable without repulling. The pending national memory-plan code/config pins remain untouched. Rollback is to stop using these new prerequisite modules; no data deletion or pointer rollback is needed.
