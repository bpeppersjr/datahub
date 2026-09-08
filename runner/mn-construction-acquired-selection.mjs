import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createMnConstructionExportStream } from './mn-construction-transport.mjs';
import { captureMnConstructionNotices } from './mn-construction-notices.mjs';
import { bindMnConstructionSourceUse } from './mn-construction-source-use.mjs';
import { validateMnConstructionSelectionContext } from './mn-construction-selected-stream.mjs';
import { buildMnConstructionRetainedSelection, verifyMnConstructionRetainedSelection } from './mn-construction-retained-selection.mjs';

const check = (value, reason) => { if (!value) throw new Error(`Minnesota acquisition selection rejected: ${reason}.`); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Joins reviewed notices, exact transport and durable selection. No default
 * native fetch or app dispatch: the app must persist this parent evidence and
 * its operation receipt before claiming a native acquisition handoff.
 */
export async function buildMnConstructionAcquiredSelection(options = {}) {
  check(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key =>
    ['notices','preflight','context','outputRoot','fetchImpl','signal','now','sleep','headerTimeoutMs','bodyTimeoutMs'].includes(key)), 'options');
  const { fetchImpl, signal, outputRoot, now: suppliedNow = () => new Date(), sleep, headerTimeoutMs, bodyTimeoutMs } = options;
  check(typeof fetchImpl === 'function' && typeof suppliedNow === 'function', 'explicit transport and clock');
  // Share one monotonic observation clock across transport, policy hooks and
  // notice capture; independent local clocks cannot establish cross-stage order.
  let previousTime;
  const now = () => {
    const value = suppliedNow().toISOString();
    check(!previousTime || value >= previousTime, 'cross-stage clock regressed');
    previousTime = value; return new Date(value);
  };
  validateMnConstructionSelectionContext(options.context);
  const context = { ...options.context }, notices = structuredClone(options.notices), preflight = structuredClone(options.preflight);
  const initialTime = now().toISOString(); bindMnConstructionSourceUse(notices, { checkedAt: initialTime });
  check(context.observedAt <= initialTime && Date.parse(initialTime) - Date.parse(context.observedAt) <= 900000, 'fresh context observation');
  let beforeBinding, afterBinding, afterNotices;
  const transport = createMnConstructionExportStream({ preflight, cohort: context.cohort, fetchImpl, signal, now,
    ...(sleep ? { sleep } : {}), ...(headerTimeoutMs === undefined ? {} : { headerTimeoutMs }), ...(bodyTimeoutMs === undefined ? {} : { bodyTimeoutMs }),
    beforeTransfer: async () => { beforeBinding = bindMnConstructionSourceUse(notices, { checkedAt: now().toISOString() }); },
    afterTransfer: async ({ signal: transferSignal }) => {
      // Pace the transition from CSV identity checks back to the publisher notices.
      if (sleep) await sleep(1000, { signal: transferSignal }); else await delay(1000, undefined, { signal: transferSignal });
      afterNotices = await captureMnConstructionNotices({ fetchImpl, signal: transferSignal, now, ...(sleep ? { sleep } : {}), ...(headerTimeoutMs === undefined ? {} : { timeoutMs: headerTimeoutMs }) });
      afterBinding = bindMnConstructionSourceUse(afterNotices, { checkedAt: now().toISOString() });
    },
  });
  try {
    const bundle = await buildMnConstructionRetainedSelection(transport.stream, { context, signal, ...(outputRoot === undefined ? {} : { outputRoot }) });
    const measured = transport.receipt();
    // A committed child must retain its parent evidence even if cancellation
    // arrives now. Finish bounded local verification; do not issue new requests.
    const verified = await verifyMnConstructionRetainedSelection(bundle.manifest_path);
    // Use the same bounded, verified read rather than reopening a mutable path.
    const selected = verified.selection_receipt;
    check(selected.source_bytes === measured.source_bytes && selected.source_file_sha256 === measured.source_file_sha256
      && hash(selected.context) === hash(context), 'transport and selection measurements differ');
    return { schema_version: 'mn-construction-acquired-selection@1.1.0', bundle: { ...bundle, manifest_sha256: verified.manifest_sha256 }, preflight,
      transport: measured, before_notices: notices, before_binding: beforeBinding, after_notices: afterNotices, after_binding: afterBinding,
      evidence_persisted: false, native_acquisition_verified: false, app_job_enrolled: false, national_reporting_integrated: false };
  } catch { signal?.throwIfAborted(); throw new Error('Minnesota acquisition selection failed; no app acquisition receipt was issued.'); }
  finally { transport.stream.destroy(); }
}
