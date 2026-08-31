# Co*Tive Collector

Co*Tive Collector is a standalone desktop management console for configuring, running, and monitoring mixed data-collection jobs in parallel. Browser jobs use Playwright and Chromium; other workers handle Google ZIP place segments, APIs, GeoJSON, downloads, file parsing, OCR, and structured JSON transforms.

## Included job types

- **Browser scrape** — Playwright navigation, scripted page actions, CSS selector extraction, pagination, and screenshots.
- **API call** — JSON or text HTTP requests with configurable method, headers, body, and timeout.
- **Map data** — GeoJSON or JSON feature pulls with feature counts, geometry types, and calculated bounds.
- **ZIP place segments** — ZIP-by-ZIP counts and permitted place IDs from the official Google Geocoding and Places Aggregate APIs, with filters, budgets, throttling, checkpoints, and expiry.
- **Retail pharmacy directory** — Discovers, downloads, validates, extracts, and caches the current CMS NPPES V2 release before streaming it to index ZIPs `00100` through `99999`; optionally enriches records from an authorized NCPDP dataQ export.
- **Download** — streamed HTTP downloads with a 50 MB safety limit.
- **Parser** — JSON, GeoJSON, CSV, and text parsing from files inside this repository.
- **OCR** — Tesseract text recognition from a URL or a local image.
- **Transform** — path selection, sorting, deduplication, field projection, and row limits for JSON artifacts.

Each run is isolated in a Node worker thread. Browser jobs also launch an isolated Chromium process. The adjustable worker pool allows 1–16 jobs to execute concurrently.

## Launch on Windows

Requirements: Node.js 22.13 or newer.

Double-click `launch-datahub.bat`. The launcher performs the one-time dependency checks and opens Co*Tive Collector as a self-contained desktop window. The runner starts and stops with the window; there is no terminal or separate browser tab to manage.

All browsers, runtime state, downloads, logs, screenshots, and outputs remain inside the `datahub` folder.

## Web development

The browser-hosted development version remains available when changing the interface:

```bash
npm install
set PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers
npx playwright install chromium
npm run dev:web
```

Open `http://localhost:3000`. The runner API listens only on `127.0.0.1:4300` unless explicitly changed with environment variables.

The **U.S. business coverage** panel is the management view over the current governed aggregate release. It provides paged state, county, ZIP, source, and explicit-gap visibility, including state-FIPS, ZIP-prefix, and gap-type filters. Annual Census Nonemployer baselines appear separately from record-level profiles and are never allocated to ZIPs. The panel is deliberately source-preserving: it does not claim a complete or deduplicated census of U.S. businesses. See [the national coverage-view contract](docs/NATIONAL-BUSINESS-COVERAGE-VIEWS.md).

## Data locations

All local files remain inside the `datahub` repository:

- `data/jobs.json` — saved job definitions
- `data/runs.json` — recent run history
- `data/outputs/` — normalized JSON outputs
- `data/checkpoints/` — resumable ZIP segment progress
- `data/pharmacy-sources/` — local NPPES and licensed enrichment inputs
- `data/pharmacies/` — pharmacy CSV, JSONL, ZIP coverage, and manifest outputs
- `data/geography/` — versioned national, state, county, and Census ZCTA polygons
- `data/zcta-jurisdiction-crosswalk/` — governed ZCTA-to-county/state polygon-area overlays
- `data/business-coverage-views/` — governed national, state, county, ZIP, source, and coverage-gap views
- `data/business-baselines/census-nonemployer/` — governed national, state, county, and industry aggregates for businesses with no paid employees
- `data/business-sources/ct-business-registry-active-organizations/` — governed Connecticut active-registration organizations and reported business-address evidence
- `data/screenshots/` — Playwright screenshots
- `data/tesseract-cache/` — OCR language cache
- `data/desktop.log` — desktop and runner service log
- `.playwright-browsers/` — project-local Playwright browser binaries
- `downloads/` — downloaded artifacts

Runtime data is ignored by Git. The empty directories are retained with `.gitkeep` files.

## Google ZIP place segments

This connector uses Google Maps Platform APIs rather than scraping `maps.google.com`. Enable the [Geocoding API](https://developers.google.com/maps/documentation/geocoding) and [Places Aggregate API](https://developers.google.com/maps/documentation/places-aggregate) for your Google Cloud project, then copy `.env.example` to `.env` and add your restricted server-side key:

```dotenv
GOOGLE_MAPS_API_KEY=your_restricted_key
```

Restart the desktop app after changing `.env`. Configure a **ZIP place segments** job with inline ZIP codes, `zipText`, or a local JSON, CSV, or text `zipFile`. Each segment accepts Google place-type filters plus optional operating status, price level, and rating filters.

```json
{
  "countryCode": "US",
  "zipCodes": ["60601", "60602"],
  "zipFile": "",
  "segments": [
    {
      "name": "Restaurants rated 4+",
      "includedTypes": ["restaurant"],
      "operatingStatus": ["OPERATING_STATUS_OPERATIONAL"],
      "minRating": 4,
      "includePlaceIds": true
    }
  ],
  "maxRequestsPerRun": 250,
  "delayMs": 250,
  "retentionDays": 30,
  "resume": true
}
```

The runner estimates the request count before starting and refuses jobs above `maxRequestsPerRun`. Aggregate outputs expire automatically after no more than 30 days; Google place IDs are the only Google location identifiers intended for durable storage. Review the [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms) for your use case.

## Nationwide retail pharmacy directory

Run the collector with no arguments:

```bat
collect-retail-pharmacies.bat
```

Before processing starts, the preflight discovers the current monthly [CMS NPPES Data Dissemination V2 file](https://download.cms.gov/nppes/NPI_Files.html), checks available disk space, streams the archive with progress, validates its ZIP structure and expected size, extracts only the main provider CSV, and atomically activates it under `data/pharmacy-sources/nppes/`. Later runs reuse the cache when it matches the current CMS release. If CMS is temporarily unavailable, a previously validated cache remains usable. The archive is removed after successful extraction by default.

The first run downloads a large archive and requires enough free space for both the download and the extracted provider CSV plus a 1 GB reserve. To use a source already inside `datahub`, pass its CSV or directory explicitly:

```bat
collect-retail-pharmacies.bat "data\pharmacy-sources\my-nppes"
```

The script streams the large NPPES CSV rather than issuing nearly 100,000 API searches. It selects organization records with the active NUCC Community/Retail Pharmacy taxonomy `3336C0003X`, requires a physical practice address, and emits records in numeric ZIP order from `00100` through `99999`.

The public NPPES source supplies the pharmacy name, physical practice address, reported ZIP+4, taxonomy, and NPI. Mail order is derived from taxonomy `3336M0002X`. NPPES does not provide drive-through service, network affiliation, corporate parent, or an NCPDP Provider ID.

For the complete requested schema, place an authorized [NCPDP dataQ](https://dataq.ncpdp.org/) CSV export inside `data/pharmacy-sources/` and pass it as the second argument:

```bat
collect-retail-pharmacies.bat auto "data\pharmacy-sources\ncpdp-dataq.csv"
```

NCPDP dataQ documents that its licensed pharmacy data includes physical and mailing addresses, NPI, parent relationships, network/relationship types, and NCPDP Provider IDs. NABP explains that a pharmacy “NABP number” usually means the NCPDP number; NABP no longer assigns a separate pharmacy number. Missing licensed fields remain blank rather than being guessed.

Use `config/pharmacy-column-map.example.json` when the enrichment export uses different headings. The same workflow is available as a **Retail pharmacy directory** job in the desktop manager. Each run produces:

- `retail-pharmacies-*.csv` — requested flat-file fields
- `retail-pharmacies-*.jsonl` — structured records with nulls preserved
- `zip-coverage-*.csv` — every ZIP in the requested range and its pharmacy count
- `retail-pharmacies-*.manifest.json` — source, completeness, and output metadata

## Browser configuration

Browser jobs accept a JSON object such as:

```json
{
  "url": "https://example.com",
  "waitUntil": "domcontentloaded",
  "timeoutMs": 45000,
  "fields": {
    "title": { "selector": "h1" },
    "links": { "selector": "a", "attribute": "href", "all": true }
  },
  "actions": [
    { "type": "click", "selector": "button.load-more" },
    { "type": "waitFor", "selector": ".results" }
  ],
  "nextSelector": "a.next",
  "maxPages": 5,
  "screenshot": true,
  "fullPage": true
}
```

Supported action types are `click`, `fill`, `press`, `select`, `wait`, and `waitFor`.

## Safety boundaries

- The runner binds to loopback by default and accepts browser requests only from local origins.
- Local input and output paths are constrained to this repository.
- HTTP payloads and downloads have a 50 MB limit.
- Worker concurrency is capped at 16.
- ZIP place jobs require an explicit per-run request budget and never save the Google API key in job data.
- Pharmacy directory fields without an authoritative source remain blank; the collector does not infer drive-through, network, parent, or NCPDP identifiers from names.
- No arbitrary JavaScript execution is accepted through the dashboard.

Only collect data you are authorized to access. Respect site terms, robots policies, authentication requirements, privacy obligations, and API rate limits.
