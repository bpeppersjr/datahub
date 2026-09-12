import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';

const states = ['pa', 'ct', 'md', 'vt', 'co', 'ia'];
const sources = Object.fromEntries(states.map(state => [`state-${state}-childcare-centers`, state]));
const check = value => { if (!value) throw new Error('Retained industry input rejected. No acquisition fallback is permitted.'); };
const object = value => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));

export function normalizeRetainedInputs(inputs, sourceIds, config) {
  if (inputs === undefined) return undefined;
  check(object(inputs) && Object.keys(inputs).length > 0 && Array.isArray(sourceIds));
  const result = {};
  for (const id of Object.keys(inputs).sort()) {
    const state = sources[id], value = inputs[id], source = config.sources[id];
    check(state && sourceIds.includes(id) && source?.script === `scripts/build-${state}-childcare.mjs`
      && source.scope === 'state' && source.states.length === 1 && source.states[0] === state.toUpperCase());
    check(object(value) && Object.keys(value).sort().join(',') === 'appReceiptPath,appReceiptSha256,kind,manifestPath,manifestSha256');
    check(value.kind === 'childcare-acquired-manifest-v1' && typeof value.manifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.manifestSha256)
      && typeof value.manifestPath === 'string' && path.isAbsolute(value.manifestPath)
      && value.manifestPath === path.resolve(value.manifestPath) && path.basename(value.manifestPath) === 'manifest.json');
    const relative = path.relative(path.join(APP_ROOT, 'data'), value.manifestPath);
    check(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    check(typeof value.appReceiptPath === 'string' && value.appReceiptPath === path.resolve(value.appReceiptPath)
      && path.basename(value.appReceiptPath) === 'receipt.json' && typeof value.appReceiptSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.appReceiptSha256));
    const parentRelative = path.relative(path.join(APP_ROOT, 'data'), value.appReceiptPath);
    check(parentRelative && !parentRelative.startsWith('..') && !path.isAbsolute(parentRelative));
    result[id] = { kind: value.kind, manifestPath: value.manifestPath, manifestSha256: value.manifestSha256,
      appReceiptPath: value.appReceiptPath, appReceiptSha256: value.appReceiptSha256 };
  }
  return result;
}

export function retainedSourceArguments(task) {
  return task.retainedInput ? ['--acquired', task.retainedInput.manifestPath] : [];
}

// Replay existing app lineage and configuration; this is entirely local and does
// not turn an injected acquisition into native evidence or a fresh observation.
export async function verifyRetainedTask(task, signal) {
  if (!task.retainedInput) return;
  const state = sources[task.sourceId]; check(state);
  const input = task.retainedInput, before = {};
  await readJson(input.manifestPath, 250000, signal, before);
  check(before.sha256 === input.manifestSha256);
  const parentReceipt = input.appReceiptPath, parentBefore = {};
  await readJson(parentReceipt, 100000, signal, parentBefore);
  check(parentBefore.sha256 === input.appReceiptSha256);
  const adapter = await import(`./${state}-childcare-app.mjs`);
  const verified = await adapter[`verify${state[0].toUpperCase() + state.slice(1)}ChildcareAppJob`](parentReceipt, { signal });
  check(verified.receipt.acquired.manifest_path === input.manifestPath
    && verified.receipt.acquired.manifest_sha256 === input.manifestSha256);
  const after = {}; await readJson(input.manifestPath, 250000, signal, after);
  const parentAfter = {}; await readJson(parentReceipt, 100000, signal, parentAfter);
  check(parentAfter.sha256 === parentBefore.sha256 && parentAfter.identity.ino === parentBefore.identity.ino
    && parentAfter.identity.dev === parentBefore.identity.dev && parentAfter.identity.ctimeNs === parentBefore.identity.ctimeNs);
  check(after.sha256 === before.sha256 && after.identity.ino === before.identity.ino
    && after.identity.dev === before.identity.dev && after.identity.ctimeNs === before.identity.ctimeNs);
  return { manifest_sha256: input.manifestSha256, parent_receipt_path: parentReceipt,
    parent_receipt_sha256: input.appReceiptSha256,
    execution_mode: 'retained-local-verification', source_execution_mode: verified.receipt.acquired.execution_mode };
}

export async function verifyRetainedPlan(plan, signal) {
  for (const task of plan.tasks) await verifyRetainedTask(task, signal);
}
