import { randomUUID, createHash } from 'node:crypto';
import { mkdir, lstat, realpath, rm, link, unlink, readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import path from 'node:path';
import { APP_ROOT } from '../runner/paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionWriter as createWriter, mnSelectionReadJson as readJson } from '../runner/mn-construction-retained-selection.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { nhSearchResultCount } from '../runner/nh-childcare-export-workflow.mjs';
import { NH_VISIBLE_SCOPE as S, NH_VISIBLE_LIMITS as L, inspectNhVisibleResults, profileNhVisibleResults } from '../runner/nh-childcare-visible-results.mjs';
import { createNhBrowserNetworkGuard } from '../runner/nh-childcare-browser-network.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/probe-nh-childcare-visible-results.mjs --run\nOne fixed public UI group-program ZIP 03755 search. Retains only selected visible business fields internally. No CSV, details, retries, statewide collection, schedule or production promotion.');
} else if (args.length !== 1 || args[0] !== '--run') {
  console.error('Explicit --run is required for the fixed New Hampshire visible-result prerequisite.'); process.exitCode = 1;
} else {
  const cancellation = createCliCancellation(), signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(90000)]);
  const runId = randomUUID(), root = path.join(APP_ROOT, 'data/business-sources/nh-childcare/visible-result-probes');
  const directory = path.join(root, runId), transient = path.join(directory, 'browser-transient');
  const policyPath = path.join(APP_ROOT, 'config/source-policies/nh-childcare-visible-internal.json');
  const network = createNhBrowserNetworkGuard(signal);
  let context, transientOwner, writer, observation, policy, policyHash, downloadCount = 0, submissions = 0, closeOnAbort, browserClosed = false;
  const receipt = { schema_version: 'nh-visible-result-prerequisite@1.0.0', run_id: runId,
    execution_mode: 'native-playwright-public-ui', started_at: new Date().toISOString(), status: 'failed-needs-inspection',
    scope: { ...S, zip4: null, search_submissions_max: 1, downloads_max: 0, detail_navigation: false },
    limits: { elapsed_ms: 90000, routed_requests: 120, selected_rows: L.rows, projection_bytes: L.projection_bytes,
      hard_network_byte_cap: false, hard_browser_disk_cap: false },
    collection_ready: false, current_operations_verified: false, statewide_completeness_verified: false,
    public_export_authorized: false, national_reporting_integrated: false, export_policy: 'internal',
    browser_cleanup_verified: false, retained_source_row_artifact: false, retained_browser_scratch: false, phase: 'prepare-local-runtime' };
  try {
    const meter = {}; policy = await readJson(policyPath, 10000, signal, meter); policyHash = meter.sha256;
    if (policy.policy_id !== 'nh-childcare-visible-internal@1.0.0' || policy.allowed_origin !== new URL(S.url).origin
      || policy.redistribution !== 'internal-only; public export not authorized') throw Error('Policy mismatch.');
    receipt.policy = { id: policy.policy_id, sha256: policyHash, path: path.relative(APP_ROOT, policyPath).replaceAll('\\', '/') };
    receipt.implementation_sha256 = {};
    for (const relative of ['scripts/probe-nh-childcare-visible-results.mjs', 'runner/nh-childcare-visible-results.mjs',
      'runner/nh-childcare-browser-network.mjs', 'runner/ok-childcare-profile-fields.mjs']) {
      receipt.implementation_sha256[relative] = createHash('sha256').update(await readFile(path.join(APP_ROOT, relative))).digest('hex');
    }
    await canonical(root, { create: true, output: true, signal });
    await mkdir(directory); await mkdir(transient); transientOwner = await lstat(transient);
    receipt.retained_browser_scratch = true;
    for (const name of ['profile', 'downloads', 'temp', 'artifacts']) await mkdir(path.join(transient, name));
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(APP_ROOT, '.playwright-browsers');
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = path.join(transient, 'temp');
    const { chromium } = await import('playwright'); signal.throwIfAborted();
    receipt.phase = 'launch-browser';
    context = await chromium.launchPersistentContext(path.join(transient, 'profile'), {
      headless: true, acceptDownloads: false, serviceWorkers: 'block', timeout: 30000,
      downloadsPath: path.join(transient, 'downloads'), artifactsDir: path.join(transient, 'artifacts'), locale: 'en-US', env: { ...process.env },
    });
    closeOnAbort = () => { void context.close().catch(() => {}); };
    signal.addEventListener('abort', closeOnAbort, { once: true });
    context.setDefaultTimeout(15000); await context.route('**/*', network.route);
    const page = context.pages()[0] ?? await context.newPage();
    page.on('download', () => { downloadCount++; });
    const state = async () => {
      receipt.phase = 'project-visible-results';
      if (page.url() !== S.url || context.pages().length !== 1) throw Error('Unexpected navigation.');
      const count = nhSearchResultCount(await page.locator('#searchResultCount').textContent());
      const cards = page.locator('ul.result-list:visible');
      const visibleCount = await cards.count();
      receipt.pre_projection_evidence = { displayed_rows: count, visible_cards: visibleCount };
      if (visibleCount > L.rows) throw Error('Row acceptance limit.');
      const projected = await cards.evaluateAll(elements => elements.map(card => {
        const details = card.querySelectorAll('.slds-tile__detail');
        if (details.length !== 1) return { rejection: 'ambiguous-detail-parent' };
        const anchors = details[0].querySelectorAll(':scope > p:first-child > a');
        const address = details[0].querySelector(':scope > div');
        if (anchors.length !== 1) return { rejection: 'ambiguous-name-link' };
        if (!address || !anchors[0].getClientRects().length || !address.getClientRects().length
          || getComputedStyle(anchors[0]).visibility !== 'visible' || getComputedStyle(address).visibility !== 'visible') return { rejection: 'missing-or-hidden-field' };
        if ([...address.children].some(child => child.tagName !== 'BR')) return { rejection: 'unsupported-address-markup' };
        return { row: { name: [...anchors[0].childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim(),
          detail_url: anchors[0].getAttribute('href'), address_lines: address.innerText.split(/\r?\n/).map(line => line.trim()).filter(Boolean) } };
      }));
      receipt.projection_rejections = projected.flatMap((item, index) => item.rejection ? [{ card_ordinal: index + 1, reason: item.rejection }] : []);
      if (receipt.projection_rejections.length) throw Error('Visible projection structure rejected.');
      const rows = projected.map(item => item.row);
      const value = { programType: (await page.locator('select.selectedProgramType option:checked').textContent())?.trim(),
        zip5: await page.getByPlaceholder('Enter zip', { exact: true }).inputValue(), completed: count !== null,
        displayedRows: count, visibleRows: rows.length, rows };
      receipt.ui_evidence = { displayed_rows: count, visible_rows: rows.length, completed: value.completed,
        program_type_matches: value.programType === S.programType, zip_matches: value.zip5 === S.zip5 };
      return value;
    };
    observation = await inspectNhVisibleResults({
      open: async url => { receipt.phase = 'open-public-search'; const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        if (response?.status() !== 200 || page.url() !== url) throw Error('Navigation failed.'); },
      select: async (type, zip) => { receipt.phase = 'select-fixed-query'; await page.locator('select.selectedProgramType').selectOption({ label: type });
        await page.getByPlaceholder('Enter zip', { exact: true }).fill(zip); },
      search: async () => { receipt.phase = 'search-once';
        if (submissions || (await page.locator('#searchResultCount').textContent())?.trim() || await page.locator('ul.result-list:visible').count()) throw Error('Unexpected search state.');
        submissions++; await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForFunction(() => /^(?:Successfully fetched\s+)?\d+\s+results?/i.test(document.querySelector('#searchResultCount')?.textContent?.trim() ?? '')); }, state,
    }, { signal });
    signal.throwIfAborted();
    if (network.snapshot().denied || downloadCount || page.url() !== S.url || context.pages().length !== 1) throw Error('Browser scope changed.');
    receipt.observed_at = new Date().toISOString(); receipt.status = 'visible-results-observed-not-collection-ready';
    receipt.phase = 'visible-projection-verified';
  } catch {
    receipt.status = 'failed-needs-inspection'; receipt.failure = signal.aborted ? 'cancelled-or-deadline' : 'public-ui-contract-not-satisfied'; process.exitCode = 1;
  } finally {
    receipt.network_before_close = { ...network.snapshot(), failures: network.diagnostics() };
    try {
      await context?.close(); browserClosed = true; signal.removeEventListener('abort', closeOnAbort ?? (() => {}));
      if (network.snapshot().denied || downloadCount || signal.aborted) throw Error('Final scope changed.');
    } catch { receipt.status = 'failed-needs-inspection'; receipt.failure ??= 'final-browser-scope-not-satisfied';
      receipt.final_browser_scope_satisfied = false; process.exitCode = 1; }
    try {
      if (transientOwner) {
        if (!browserClosed) throw Error('Browser closure unverified.');
        await canonical(transient); const now = await lstat(transient);
        if (now.isSymbolicLink() || now.ino !== transientOwner.ino || now.dev !== transientOwner.dev || await realpath(transient) !== transient
          || path.dirname(transient) !== directory || path.dirname(directory) !== root || path.basename(directory) !== runId) throw Error('Ownership changed.');
        await rm(transient, { recursive: true, force: false }); receipt.browser_cleanup_verified = true; receipt.retained_browser_scratch = false;
      }
    } catch { receipt.status = 'failed-needs-inspection'; receipt.failure = 'browser-cleanup-needs-inspection';
      receipt.retained_browser_scratch = null; process.exitCode = 1; }
    receipt.routed_requests = network.snapshot().requests; receipt.network_scope_denied = network.snapshot().denied;
    receipt.network_failures = network.diagnostics();
    receipt.download_events = downloadCount; receipt.search_submissions = submissions; receipt.finished_at = new Date().toISOString();
    cancellation.dispose();
    try {
      await canonical(directory);
      if (receipt.status === 'visible-results-observed-not-collection-ready') {
        const meter = {}, reread = await readJson(policyPath, 10000, undefined, meter);
        if (meter.sha256 !== policyHash || !same(reread, policy) || !receipt.browser_cleanup_verified) throw Error('Policy or cleanup changed.');
        receipt.observation = profileNhVisibleResults(observation.selected);
        receipt.retained_source_row_artifact = receipt.observation.source_rows > 0;
      }
      const temporary = path.join(directory, 'manifest.tmp'), manifest = path.join(directory, 'manifest.json');
      writer = await createWriter(temporary, L.manifest_bytes, undefined, new Map());
      await writer.write(receipt); const descriptor = await writer.finish();
      const meter = {}, saved = await readJson(temporary, L.manifest_bytes, undefined, meter);
      if (meter.sha256 !== descriptor.sha256 || !same(saved, receipt)
        || saved.observation && !same(profileNhVisibleResults(saved.observation.selected), saved.observation)) throw Error('Receipt verification failed.');
      await link(temporary, manifest); await unlink(temporary);
      const finalMeter = {}, published = await readJson(manifest, L.manifest_bytes, undefined, finalMeter);
      if (finalMeter.sha256 !== meter.sha256 || !same(published, saved)) throw Error('Published receipt changed.');
      console.log(JSON.stringify({ run_id: runId, status: receipt.status, manifest: path.relative(APP_ROOT, manifest).replaceAll('\\', '/'), sha256: meter.sha256 }));
    } catch { console.error('New Hampshire visible-result receipt requires inspection.'); process.exitCode = 1;
    } finally { await writer?.close(); }
  }
}
