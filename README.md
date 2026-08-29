# Co*Tive Collector

Co*Tive Collector is a standalone desktop management console for configuring, running, and monitoring mixed data-collection jobs in parallel. Browser jobs use Playwright and Chromium; other workers handle Google ZIP place segments, APIs, GeoJSON, downloads, file parsing, OCR, and structured JSON transforms.

## Included job types

- **Browser scrape** — Playwright navigation, scripted page actions, CSS selector extraction, pagination, and screenshots.
- **API call** — JSON or text HTTP requests with configurable method, headers, body, and timeout.
- **Map data** — GeoJSON or JSON feature pulls with feature counts, geometry types, and calculated bounds.
- **ZIP place segments** — ZIP-by-ZIP counts and permitted place IDs from the official Google Geocoding and Places Aggregate APIs, with filters, budgets, throttling, checkpoints, and expiry.
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

## Data locations

All local files remain inside the `datahub` repository:

- `data/jobs.json` — saved job definitions
- `data/runs.json` — recent run history
- `data/outputs/` — normalized JSON outputs
- `data/checkpoints/` — resumable ZIP segment progress
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
- No arbitrary JavaScript execution is accepted through the dashboard.

Only collect data you are authorized to access. Respect site terms, robots policies, authentication requirements, privacy obligations, and API rate limits.
