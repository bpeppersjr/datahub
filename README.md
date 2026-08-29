# Atlas Runner

Atlas Runner is a local Node.js operations console for managing and executing mixed data-collection jobs in parallel. Browser jobs use Playwright and Chromium; other workers handle APIs, GeoJSON, downloads, file parsing, OCR, and structured JSON transforms.

## Included job types

- **Browser scrape** — Playwright navigation, scripted page actions, CSS selector extraction, pagination, and screenshots.
- **API call** — JSON or text HTTP requests with configurable method, headers, body, and timeout.
- **Map data** — GeoJSON or JSON feature pulls with feature counts, geometry types, and calculated bounds.
- **Download** — streamed HTTP downloads with a 50 MB safety limit.
- **Parser** — JSON, GeoJSON, CSV, and text parsing from files inside this repository.
- **OCR** — Tesseract text recognition from a URL or a local image.
- **Transform** — path selection, sorting, deduplication, field projection, and row limits for JSON artifacts.

Each run is isolated in a Node worker thread. Browser jobs also launch an isolated Chromium process. The adjustable worker pool allows 1–16 jobs to execute concurrently.

## Start locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`. The runner API listens only on `127.0.0.1:4300` unless explicitly changed with environment variables.

## Data locations

All local files remain inside the `datahub` repository:

- `data/jobs.json` — saved job definitions
- `data/runs.json` — recent run history
- `data/outputs/` — normalized JSON outputs
- `data/screenshots/` — Playwright screenshots
- `data/tesseract-cache/` — OCR language cache
- `downloads/` — downloaded artifacts

Runtime data is ignored by Git. The empty directories are retained with `.gitkeep` files.

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
- No arbitrary JavaScript execution is accepted through the dashboard.

Only collect data you are authorized to access. Respect site terms, robots policies, authentication requirements, privacy obligations, and API rate limits.
