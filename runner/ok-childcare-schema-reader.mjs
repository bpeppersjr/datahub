import path from 'node:path';
import { lstat, readdir } from 'node:fs/promises';
import { mnSelectionCanonical, mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { OK_CHILDCARE_SCHEMA_PROBE_CONTRACT as C, OK_CHILDCARE_SCHEMA_PROBE_VERSION as VERSION } from './ok-childcare-schema-probe.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const check = value => { if (!value) throw Error('Oklahoma schema receipt rejected.'); };
const integer = (v, maximum) => Number.isSafeInteger(v) && v >= 0 && v <= maximum;
const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const knownFields = ['address', 'addressLines', 'coordinates', 'distance', 'facilityType', 'hours', 'isSubsidyAccepted', 'name', 'officialDoingBusinessAs', 'vendorId'];
function validate(m, operationId, startedAt) {
  check(exact(m, ['run_id', 'operation_id', 'schema_version', 'execution_mode', 'started_at', 'finished_at', 'status', 'requests', 'schema', 'claims']));
  check(UUID.test(m.run_id) && m.operation_id === operationId && m.schema_version === VERSION && m.execution_mode === 'native-fetch'
    && m.status === 'schema-observed-not-collection-ready' && iso(m.started_at) && iso(m.finished_at) && iso(startedAt)
    && m.started_at >= startedAt && m.finished_at >= m.started_at && Date.parse(m.finished_at) - Date.parse(m.started_at) <= C.deadline_ms + 10000);
  check(exact(m.claims, ['collection_ready', 'source_authority_verified', 'current_business_status_verified', 'statewide_completeness_verified', 'public_export_authorized', 'provider_values_retained', 'app_enrolled']) && Object.values(m.claims).every(v => v === false));
  check(Array.isArray(m.requests) && m.requests.length === 3);
  for (const [i, r] of m.requests.entries()) {
    check(exact(r, ['method', 'url', 'status', 'decoded_bytes', 'decoded_sha256', 'complete']) && r.method === 'GET' && r.status === 200 && r.complete === true
      && r.url === (i === 1 ? C.results_url : C.client_url) && integer(r.decoded_bytes, 1000000) && r.decoded_bytes > 0 && typeof r.decoded_sha256 === 'string' && HASH.test(r.decoded_sha256));
    if (i !== 1) check(r.decoded_bytes === C.client_bytes && r.decoded_sha256 === C.client_sha256);
  }
  const s = m.schema;
  check(exact(s, ['counts', 'fields', 'unknown_page_field_count', 'pagination', 'zip_field_semantics', 'center_filter_verified'])
    && s.pagination === 'unknown' && s.zip_field_semantics === 'unverified' && integer(s.unknown_page_field_count, 128));
  const c = s.counts;
  check(exact(c, ['rows', 'center_rows', 'home_rows', 'unknown_type_rows', 'missing_type_rows', 'unknown_field_occurrences', 'point_missing', 'numeric_point_in_range', 'point_other'])
    && integer(c.rows, C.max_rows) && integer(c.unknown_field_occurrences, c.rows * 128));
  for (const k of ['center_rows', 'home_rows', 'unknown_type_rows', 'missing_type_rows', 'point_missing', 'numeric_point_in_range', 'point_other']) check(integer(c[k], c.rows));
  check(c.center_rows + c.home_rows + c.unknown_type_rows + c.missing_type_rows === c.rows && c.point_missing + c.numeric_point_in_range + c.point_other === c.rows
    && s.center_filter_verified === (c.rows > 0 && c.center_rows === c.rows));
  check(Array.isArray(s.fields) && s.fields.length <= knownFields.length);
  const seen = new Set();
  for (const f of s.fields) {
    check(exact(f, ['field', 'present', 'types']) && knownFields.includes(f.field) && !seen.has(f.field) && integer(f.present, c.rows) && f.present > 0);
    seen.add(f.field);
    check(f.types && Object.getPrototypeOf(f.types) === Object.prototype && Object.keys(f.types).length > 0
      && Object.entries(f.types).every(([k, v]) => ['null', 'array', 'object', 'string', 'number', 'boolean'].includes(k) && integer(v, f.present) && v > 0)
      && Object.values(f.types).reduce((a, b) => a + b, 0) === f.present);
  }
  const facility = s.fields.find(f => f.field === 'facilityType');
  const point = s.fields.find(f => f.field === 'coordinates');
  check(c.missing_type_rows === c.rows - (facility?.present ?? 0) + (facility?.types.null ?? 0)
    && c.center_rows + c.home_rows <= (facility?.types.string ?? 0)
    && c.point_missing === c.rows - (point?.present ?? 0) + (point?.types.null ?? 0)
    && c.numeric_point_in_range <= (point?.types.object ?? 0)
    && c.unknown_field_occurrences <= c.rows * 128 - s.fields.reduce((total, f) => total + f.present, 0));
}

// Verifies retained structure, binding and byte integrity, not remote authenticity or replay of discarded provider values.
export async function readOkChildcareSchemaReceipt(manifestPath, expectedSha256, { operationId, operationRoot, startedAt } = {}) {
  try {
    check(typeof manifestPath === 'string' && typeof operationRoot === 'string' && operationRoot === path.resolve(operationRoot)
      && path.basename(operationRoot) === 'output' && typeof operationId === 'string' && UUID.test(operationId)
      && path.basename(path.dirname(operationRoot)) === operationId && typeof expectedSha256 === 'string' && HASH.test(expectedSha256));
    const directory = path.dirname(manifestPath), runId = path.basename(directory);
    check(UUID.test(runId) && manifestPath === path.join(operationRoot, 'jobs', runId, 'manifest.json'));
    await mnSelectionCanonical(directory);
    const owner = await lstat(directory, { bigint: true });
    check(JSON.stringify(await readdir(directory)) === '["manifest.json"]');
    const first = {}, second = {};
    const m = await mnSelectionReadJson(manifestPath, 100000, undefined, first);
    check(first.sha256 === expectedSha256 && m.run_id === runId); validate(m, operationId, startedAt);
    await mnSelectionReadJson(manifestPath, 100000, undefined, second);
    const after = await lstat(directory, { bigint: true });
    check(first.sha256 === second.sha256 && first.identity.ino === second.identity.ino && first.identity.dev === second.identity.dev
      && owner.ino === after.ino && owner.dev === after.dev && !after.isSymbolicLink() && JSON.stringify(await readdir(directory)) === '["manifest.json"]');
    return { manifest: m, sha256: first.sha256 };
  } catch { throw Error('Oklahoma managed schema receipt verification failed; preserve outputs for inspection.'); }
}
