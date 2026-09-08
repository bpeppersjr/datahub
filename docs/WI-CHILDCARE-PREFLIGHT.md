# Wisconsin licensed-group childcare prerequisite

The standalone command `node scripts/preflight-wi-childcare.mjs` checks the fixed public Wisconsin DHS source before a future acquisition connector runs. It requires no Codex session, API key or account. It saves an immutable, checksummed receipt inside `data/business-sources/wi-dhs-licensed-group-childcare/preflights`; it does not collect facility rows, enroll a worker, schedule refreshes or publish coverage.

## Executed contract

The ten-request sequence checks server ownership, layer metadata, the owning portal's service item, the separate public ArcGIS layer item and the selected count, then repeats them in reverse. Requests are serial, spaced one second apart, capped at 128 KiB per response and a 15-second per-attempt deadline including body consumption. At most three attempts are allowed for transient network/deadline failures and HTTP 429/5xx. Publisher Retry-After is honored; waits over one minute defer rather than being shortened. Cancellation interrupts requests, body reads and pacing. Redirects, ArcGIS errors, facility/ID payloads, invalid UTF-8, oversized bodies and malformed envelopes fail closed.

The contract pins both item roles, the public service/layer URLs, all 23 declared field names/types/lengths/domains, query capabilities, the OID and native Web Mercator CRS. It defines an explicit 12-field future business/address allowlist excluding contact names/telephone. `CategoryType='LICENSED GROUP'` is fixed. Counts may change between preflights; zero or more than 50,000 requires review. Changed retained metadata or counts within one preflight are rejected. This is a paired observation check, not proof of a transactional snapshot.

Only selected public metadata fields and complete returned item `licenseInfo` strings are retained. Private service addresses and token-generation routes are neither retained nor followed. The receipt is reconstructible from its hashed observations; output claims cannot be changed independently. Receipt publication uses fsynced exclusive temporary files and non-overwriting hard-link publication, with canonical-path and ownership checks. Tests use separate `data/tmp` directories, not the live source receipt folder.

## Evidence and remaining acquisition gates

Live prerequisite receipt: `data/business-sources/wi-dhs-licensed-group-childcare/preflights/cea7d17b-4e92-4643-9326-707fe9b02427.json`, SHA-256 `266579e3a6fceba591f63f2c98fd5f8a38b2490693d76da40a9c1bca8bcbc88b`, 23,914 bytes. It observed 2,382 selected source rows, with zero facility requests. This is source-count evidence, not 2,382 acquired businesses.

The receipt explicitly leaves acquisition, connector readiness, scheduling and export authorization false. Still required:

- Retain and review the complete linked GIS disclaimer, layer iteminfo and available XML metadata. Current notice checks require known phrases/link and paired consistency, not an exact cross-release legal-text pin or complete policy approval.
- Validate an explicit WGS84 point reprojection, missing/invalid point handling and separate ZIP5/ZIP4 normalization. Never use native Web Mercator x/y as latitude/longitude or attach polygons to business rows.
- Build and test the selected-ID acquisition, exact page/ID reconciliation, source-drift rejection, immutable release and app-worker enrollment. Then hand downloads to Co*Tive with operation/receipt evidence and release the agent slot.

Publisher category membership and portal modification clocks do not establish independent operational status, licensure dates, source freshness or nationwide completeness. Preserve the [original assessment](states/WI-CHILDCARE-ACCESS-2026-09-07.md), [metadata recheck](states/WI-CHILDCARE-RECHECK-2026-09-07.md) and separate corporate-registry hold.

## Verification and rollback

Eleven new offline tests cover the fixed request itinerary, both item roles, schema/CRS/error/privacy gates, changed counts and metadata, forged receipt claims, declared/streamed byte limits, fatal UTF-8, stalled-body deadlines, cancellation, Retry-After, redirects, immutable publication and redirected output rejection. A read-only peer review identified a final cancellation-boundary gap; the writer now checks immediately before publication and verifies final inode/link ownership.

The full `npm run check` attempt ran 803 tests: 802 passed and the development-supervisor test conflicted with the existing preview. After the build, gracefully stopping only the preview allowed both lifecycle tests plus all eleven final Wisconsin tests to pass (13/13); desktop smoke passed and the preview was restored with HTTP 200. This covers 804 distinct tests across runs, not a single clean full-check exit. Lint, final web/desktop builds, TypeScript and production dependency audit passed (zero reported vulnerabilities). Logs: `data/tmp/wi-preflight-full-check.log`, `wi-preflight-focused-check.log`, `wi-preflight-desktop-check.log` and `wi-preflight-final-build.log` in the same directory. All 40 code hashes pinned by the existing Tennessee production plan remained unchanged.

Two initial synthetic test receipts were relocated from the source directory into `data/tmp/wi-preflight-initial-test-receipts`; neither was business data and both remain recoverable. All subsequent fixture receipts are isolated under `data/tmp`. The live source directory retains the actual receipt cited above.

This addition changes no source release pointers, app schedules or production data. Rollback consists of removing the new Wisconsin preflight module/test/CLI and documentation while retaining its historical evidence. No automatic download is enabled by this increment.
