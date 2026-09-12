# Collection next actions — 2026-09-12 UTC

Decision recorded on September 12, 2026 UTC (September 11 in America/Chicago). This is a documentation-only handoff of evidence reviewed this turn, not an acquisition approval, dispatch or new runtime receipt. No national completeness claim is made.

## Strongest nationwide next source: Overture Places

Overture is the strongest next nationwide candidate, but no accepted native acquisition is available to reuse. The only acquisition, `a8ff9f6d-b2be-4d56-905b-17984788b1d5`, is `FAILED`, has `snapshotReady: false`, a zero-byte selected gzip, and no accepted manifest. Preserve its failed evidence; do not label it collected, normalized, ready or resumable.

The successful metadata prerequisite `c7fd0208-eb13-442a-8982-8a5d1ef2927e` and runtime prerequisite `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1` were independently reread by the reviewer this turn. The selected release is `2026-08-19.0`, with 16 assets and 73,631,092 **global** rows. That count is not a U.S. count, an accepted-row count or a number of unique active businesses.

The native worker and downstream normalizer are already implemented. The next acquisition requires fresh explicit large-acquisition authorization; prerequisite success and this document do not supply it. There is no automatic retry. Once authorized, dispatch through the existing app-owned flow and hand routine execution to the app; inspect its terminal receipt before any local normalization or reporting adoption. See [app-owned acquisition limits and lifecycle](OVERTURE-ACQUISITION-SESSION.md) and [source policy](OVERTURE-US-PLACES.md).

The existing bounded contract remains:

- One sequential request, at least 250 ms pacing, no retries or redirects.
- At most 100,000 requests, 32 GiB of reserved response ranges and 64 MiB per range. The 32 GiB budget is a network/range reservation limit, not RAM; failed reservations are not refunded and it is not a hard wire-byte cap.
- One engine thread, 2 GiB engine memory setting and 4 GiB spill-disk setting. These are not an operating-system process RAM cap.
- 10 GiB free-space preflight; selected output limited to 4 GiB compressed, 16 GiB uncompressed, 20 million rows and 16 MiB per line.
- Four-hour cooperative session deadline and 30-second cooperative request timeout; no automatic bound expansion or source retry.

Source references: [Overture Places guide](https://docs.overturemaps.org/guides/places/), [Place schema](https://docs.overturemaps.org/schema/reference/places/place/), [STAC catalog](https://stac.overturemaps.org/catalog.json), and [attribution/licensing](https://docs.overturemaps.org/attribution/). Source taxonomy or status does not establish legal status, current operations, verified premises or complete nationwide coverage.

## Already in production: reuse, do not reacquire

EPA ECHO's 1,517,826 accepted active regulated-facility records and FSIS's 7,237 records are already integrated in production. They are not new acquisition opportunities merely because another state view needs them. Reuse their retained production-selected evidence; do not redownload to promote or redisplay it. Their source-specific populations are not a nationwide business census. See [EPA ECHO](EPA-ECHO.md) and the official [EPA data downloads](https://echo.epa.gov/tools/data-downloads) and [FSIS establishment directory](https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory).

## New independent Maine lead: licensed medical providers

The integrator reviewed Maine's official [Provider Search Help](https://gateway.maine.gov/dhhs-apps/aspen/help.asp) today. It documents category/subtype selection, county/town selection, selecting all results, and spreadsheet output. This establishes a discovery lead, not a verified bulk interface or complete acquired dataset. Subsequent ordinary-session and county/town form observations are recorded in the [Maine medical-provider contract note](states/ME-MEDICAL-PROVIDER-CONTRACT-2026-09-12.md); the observed redirect is an ordinary selection step, not an access denial.

Start with ambulatory surgical centers as a bounded licensed-medical-provider scope. Before collection, a contract preflight must establish the ordinary request/session sequence, pagination and completeness behavior, spreadsheet schema, source identifier stability, address role, license/status meaning, and permitted use/retention/redistribution policy. County or town search filters must not be treated as independently verified address geography. If the ordinary flow is gated or its semantics remain unclear, report the constraint rather than infer an alternate endpoint or complete coverage.

No provider query or spreadsheet download was performed in this work. No Maine records are claimed collected, and no collector readiness, source permission or acquisition approval is inferred from the help page.

## Handoff boundary

This change adds only this decision document. It creates no approvals, schedules, operations, runtime receipts, downloads or production-pointer changes. No full test rerun or app restart is needed for this documentation-only update. Prepared by the supported Astra documentation agent; the integrator retains final review and commit ownership.
