import { randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, rm, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from '../runner/paths.mjs';
import { mnSelectionCanonical, mnSelectionWriter, mnSelectionReadJson } from '../runner/mn-construction-retained-selection.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { inspectNhSearchExport, nhSearchResultCount } from '../runner/nh-childcare-export-workflow.mjs';
import { NH_EXPORT_LIMITS } from '../runner/nh-childcare-export-profile.mjs';
import { createNhBrowserNetworkGuard } from '../runner/nh-childcare-browser-network.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/probe-nh-childcare-search-export.mjs --run\nOne fixed public-UI group-program search at ZIP 03755 and its search-only CSV export. No retry, statewide export, production publication or schedule. All temporary browser data stays under datahub; only aggregate evidence is retained.');
} else if (args.length !== 1 || args[0] !== '--run') {
  console.error('Explicit --run is required for the fixed New Hampshire export prerequisite.'); process.exitCode = 1;
} else {
  const cancellation = createCliCancellation();
  const deadline = AbortSignal.timeout(90000);
  const signal = AbortSignal.any([cancellation.signal, deadline]);
  const runId = randomUUID();
  const root = path.join(APP_ROOT, 'data/business-sources/nh-childcare/search-export-probes');
  const directory = path.join(root, runId), transient = path.join(directory, 'browser-transient');
  let context, transientOwner, writer, descriptor, downloadCount = 0;
  const network = createNhBrowserNetworkGuard(signal);
  const started = new Date().toISOString();
  const receipt = { schema_version: 'nh-childcare-search-export-prerequisite@1.0.0', run_id: runId,
    execution_mode: 'native-playwright-public-ui', started_at: started, status: 'failed-needs-inspection',
    scope: { zip5: '03755', zip4: null, program_type: 'Licensed Group Child Care Program',
      source_url: 'https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch', search_submissions_max: 1,
      search_export_clicks_max: 1, provider_wide_export: false },
    limits: { elapsed_ms: 90000, routed_requests: 120, csv_acceptance_bytes: NH_EXPORT_LIMITS.bytes,
      csv_acceptance_rows: NH_EXPORT_LIMITS.rows, hard_network_byte_cap: false, hard_browser_disk_cap: false },
    collection_ready: false, statewide_completeness_verified: false, public_export_authorized: false,
    national_reporting_integrated: false, export_policy: 'internal',
    source_rows_temporarily_persisted: true, retained_source_row_artifact: false,
    browser_cleanup_verified: false, phase: 'prepare-local-runtime' };
  try {
    await mnSelectionCanonical(root, { create: true, output: true, signal });
    await mkdir(directory); await mkdir(transient); transientOwner = await lstat(transient);
    for (const name of ['profile', 'downloads', 'temp', 'artifacts']) await mkdir(path.join(transient, name));
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(APP_ROOT, '.playwright-browsers');
    // Playwright itself uses the parent process temp directory for launch state.
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = path.join(transient, 'temp');
    const { chromium } = await import('playwright');
    signal.throwIfAborted();
    receipt.phase = 'launch-local-browser';
    context = await chromium.launchPersistentContext(path.join(transient, 'profile'), {
      headless: true, acceptDownloads: true, serviceWorkers: 'block', timeout: 30000,
      downloadsPath: path.join(transient, 'downloads'), artifactsDir: path.join(transient, 'artifacts'),
      locale: 'en-US', env: { ...process.env },
    });
    const closeOnAbort = () => { void context.close().catch(() => {}); };
    signal.addEventListener('abort', closeOnAbort, { once: true });
    context.setDefaultTimeout(15000);
    await context.route('**/*', network.route);
    const page = context.pages()[0] ?? await context.newPage();
    page.on('download', () => { downloadCount++; });
    const exports = () => page.locator('a[onclick="downloadSearchResults(); return false;"]:visible');
    const state = async () => {
      const countText = await page.locator('#searchResultCount').textContent();
      const count = nhSearchResultCount(countText);
      const value = { programType: (await page.locator('select.selectedProgramType option:checked').textContent())?.trim(),
        zip5: await page.getByPlaceholder('Enter zip', { exact: true }).inputValue(),
        completed: count !== null, displayedRows: count,
        visibleRows: await page.locator('ul.result-list:visible').count(), exportControls: await exports().count() };
      receipt.ui_evidence = { program_type_matches: value.programType === receipt.scope.program_type,
        zip_matches: value.zip5 === receipt.scope.zip5, completed: value.completed,
        displayed_rows: value.displayedRows, visible_rows: value.visibleRows, export_controls: value.exportControls };
      return value;
    };
    receipt.observation = await inspectNhSearchExport({
      open: async url => { receipt.phase = 'open-public-search'; const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        if (response?.status() !== 200 || page.url() !== url) throw Error('Navigation failed.'); },
      select: async (type, zip) => { receipt.phase = 'select-fixed-query'; await page.locator('select.selectedProgramType').selectOption({ label: type });
        await page.getByPlaceholder('Enter zip', { exact: true }).fill(zip); },
      search: async () => { receipt.phase = 'search-once';
        if ((await page.locator('#searchResultCount').textContent())?.trim()
          || await page.locator('ul.result-list:visible').count()) throw Error('Unexpected initial results.');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForFunction(() => /^(?:Successfully fetched\s+)?\d+\s+results?/i.test(document.querySelector('#searchResultCount')?.textContent?.trim() ?? '')); },
      state,
      download: async () => {
        receipt.phase = 'download-search-results-once';
        const [download] = await Promise.all([page.waitForEvent('download'), exports().click()]);
        receipt.phase = 'read-search-export';
        receipt.download_name_matches = download.suggestedFilename() === 'SearchResults.csv';
        const stream = await download.createReadStream(); if (!stream) throw Error('Download unavailable.');
        let bytes = 0; const chunks = [];
        for await (const chunk of stream) { signal.throwIfAborted(); bytes += chunk.length;
          if (bytes > NH_EXPORT_LIMITS.bytes) { stream.destroy(); throw Error('Export acceptance limit.'); } chunks.push(chunk); }
        if (await download.failure()) throw Error('Download failed.');
        receipt.download_bytes = bytes;
        receipt.phase = 'validate-search-export';
        return { filename: download.suggestedFilename(), count: downloadCount, bytes: Buffer.concat(chunks) };
      },
    }, { signal });
    if (network.snapshot().denied || downloadCount !== 1) throw Error('Browser scope changed.');
    receipt.status = 'export-profile-observed-not-collection-ready';
    receipt.phase = 'export-profile-verified';
    signal.removeEventListener('abort', closeOnAbort);
  } catch (error) {
    receipt.status = 'failed-needs-inspection';
    receipt.failure = signal.aborted ? 'cancelled-or-deadline' : 'public-ui-or-export-contract-not-satisfied';
    if (['NH_EXPORT_acceptance-limits', 'NH_EXPORT_csv-syntax', 'NH_EXPORT_schema-or-row-count', 'NH_EXPORT_encoding-or-content'].includes(error?.code)) receipt.csv_rejection = error.code;
    process.exitCode = 1;
  } finally {
    try {
      await context?.close();
      if (receipt.status === 'export-profile-observed-not-collection-ready' && (downloadCount !== 1 || network.snapshot().denied)) {
        receipt.status = 'failed-needs-inspection'; receipt.failure = 'final-browser-scope-not-satisfied'; process.exitCode = 1;
      }
      if (transientOwner) {
        await mnSelectionCanonical(transient);
        const now = await lstat(transient);
        if (now.isSymbolicLink() || now.ino !== transientOwner.ino || now.dev !== transientOwner.dev
          || await realpath(transient) !== transient || path.dirname(transient) !== directory
          || path.dirname(directory) !== root || path.basename(directory) !== runId) throw Error('Temporary ownership changed.');
        // Only this invocation's newly created browser scratch directory.
        await rm(transient, { recursive: true, force: false });
        receipt.browser_cleanup_verified = true;
      }
    } catch { receipt.status = 'failed-needs-inspection'; receipt.failure = 'browser-cleanup-needs-inspection';
      receipt.retained_source_row_artifact = null; process.exitCode = 1; }
    receipt.routed_requests = network.snapshot().requests;
    receipt.network_scope_denied = network.snapshot().denied;
    receipt.download_events = downloadCount;
    receipt.finished_at = new Date().toISOString();
    cancellation.dispose();
    try {
      await mnSelectionCanonical(directory);
      const temporary = path.join(directory, 'manifest.tmp'), manifest = path.join(directory, 'manifest.json');
      writer = await mnSelectionWriter(temporary, 100000, undefined, new Map());
      await writer.write(receipt); descriptor = await writer.finish();
      await link(temporary, manifest); await unlink(temporary);
      const meter = {}; const saved = await mnSelectionReadJson(manifest, 100000, undefined, meter);
      if (meter.sha256 !== descriptor.sha256 || JSON.stringify(saved) !== JSON.stringify(receipt)) throw Error('Receipt changed.');
      console.log(JSON.stringify({ run_id: runId, status: receipt.status,
        manifest: path.relative(APP_ROOT, manifest).replaceAll('\\', '/'), sha256: meter.sha256 }));
    } catch { console.error('New Hampshire prerequisite receipt needs inspection.'); process.exitCode = 1;
    } finally { await writer?.close(); }
  }
}
