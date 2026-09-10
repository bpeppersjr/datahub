import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { verifyMdChildcareAppJob } from './md-childcare-app.mjs';

export const MD_COUNTY_POLICY_PATH = 'config/source-policies/md-childcare-county-derivation-internal.json';
export const MD_COUNTY_POLICY_DIGEST = '33b83405197cbfc2f599b91fdda1aee497f4467a8dedb6f61f691bcbdc4682a9';
const contexts = new WeakMap();
const fail = () => { throw Error('Maryland county overlay authorization requires inspection.'); };
const hash = value => createHash('sha256').update(value).digest('hex');

function canonical(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 4000 || depth > 12) fail();
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') { if (value.length > 20000) fail(); return value; }
  if (!value || typeof value !== 'object' || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) fail();
  if (Array.isArray(value)) {
    if (value.length > 1000 || keys.length !== value.length + 1) fail();
    return Array.from({ length: value.length }, (_, i) => canonical(descriptors[i].value, budget, depth + 1));
  }
  if (Object.hasOwn(descriptors, 'toJSON')) fail();
  return Object.fromEntries(keys.sort().map(key => [key, canonical(descriptors[key].value, budget, depth + 1)]));
}

/** Document validation alone never issues production authorization. */
export function validateMdCountyOverlayPolicyDocument(value) {
  if (hash(JSON.stringify(canonical(value))) !== MD_COUNTY_POLICY_DIGEST) fail();
  return true;
}
function options(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(key => key !== 'signal'
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail();
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) fail();
  value.signal?.throwIfAborted(); return value.signal;
}
async function snapshot(file, maximum, signal, expected) {
  const meter = {}, value = await readJson(file, maximum, signal, meter);
  if (expected && meter.sha256 !== expected) fail(); return { value, sha256: meter.sha256, bytes: meter.bytes };
}

async function verify(signal) {
  const selected = await snapshot(path.join(APP_ROOT, MD_COUNTY_POLICY_PATH), 30000, signal);
  validateMdCountyOverlayPolicyDocument(selected.value); const policy = selected.value;
  await snapshot(path.join(APP_ROOT, policy.historical_policy.path), 30000, signal, policy.historical_policy.sha256);
  const receiptPath = path.join(APP_ROOT, policy.receipt.path);
  const app = await verifyMdChildcareAppJob(receiptPath, { signal }), receipt = app.receipt;
  if (app.receipt_sha256 !== policy.receipt.sha256 || receipt.execution_mode !== 'fixed-native-fetch'
    || receipt.acquired.manifest_sha256 !== policy.acquired_manifest_sha256
    || receipt.normalized.manifest_sha256 !== policy.normalized_manifest_sha256
    || receipt.normalized.record_count !== policy.source_candidate_rows || receipt.normalized.quarantine_count !== 0) fail();
  const acquired = await snapshot(receipt.acquired.manifest_path, 100000, signal, policy.acquired_manifest_sha256);
  const descriptors = acquired.value.artifacts.filter(item => item.path === policy.prerequisite.path);
  if (descriptors.length !== 1 || !same(descriptors[0], policy.prerequisite)) fail();
  const prerequisitePath = path.join(path.dirname(receipt.acquired.manifest_path), policy.prerequisite.path);
  const prerequisite = await snapshot(prerequisitePath, 100000, signal, policy.prerequisite.sha256);
  if (prerequisite.bytes !== policy.prerequisite.bytes) fail();
  const items = prerequisite.value.preflight.observations.filter(item => item.kind === 'item');
  if (items.length !== 2 || items.some(item => item.payload_sha256 !== policy.item_payload_sha256
    || hash(JSON.stringify(item.payload)) !== policy.item_payload_sha256)) fail();
  const finalPolicy = await snapshot(path.join(APP_ROOT, MD_COUNTY_POLICY_PATH), 30000, signal, selected.sha256);
  if (!same(finalPolicy.value, policy)) fail();
  await snapshot(prerequisitePath, 100000, signal, prerequisite.sha256);
  await snapshot(path.join(APP_ROOT, policy.historical_policy.path), 30000, signal, policy.historical_policy.sha256);
  const finalApp = await verifyMdChildcareAppJob(receiptPath, { signal });
  if (!same(finalApp, app)) fail(); signal?.throwIfAborted();
  return { policy_id: policy.policy_id, policy_version: policy.version, policy_path: MD_COUNTY_POLICY_PATH,
    policy_sha256: selected.sha256, policy_document_sha256: MD_COUNTY_POLICY_DIGEST,
    historical_policy: policy.historical_policy, receipt: policy.receipt,
    acquired_manifest_sha256: policy.acquired_manifest_sha256, normalized_manifest_sha256: policy.normalized_manifest_sha256,
    prerequisite: { ...policy.prerequisite, absolute_path: prerequisitePath },
    original_item_observations: items, metadata_retention_mode: 'unchanged-retained-parsed-item-metadata-and-original-artifact-reference',
    registry_manifest_sha256: policy.registry_manifest_sha256, geography_manifest_sha256: policy.geography_manifest_sha256,
    source_dataset_id: policy.source_dataset_id, source_candidate_rows: policy.source_candidate_rows,
    publisher_cohort_date: policy.publisher_cohort_date, attribution: policy.attribution,
    source_requests: 0, public_export_authorized: false, national_promotion_authorized: false };
}

/** Fixed retained inputs only. This token is process-local, not durable publisher approval. */
export async function loadMdCountyOverlayAuthorization(value = {}) {
  const bindings = await verify(options(value)), context = Object.freeze({});
  contexts.set(context, bindings); return context;
}
export function mdCountyOverlayBindings(context) {
  if (!contexts.has(context)) fail(); return structuredClone(contexts.get(context));
}
export async function reverifyMdCountyOverlayAuthorization(context, value = {}) {
  const signal = options(value), bindings = mdCountyOverlayBindings(context);
  if (!same(bindings, await verify(signal))) fail(); return bindings;
}
