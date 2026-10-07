import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { PA_CHILDCARE_FIELDS } from './pa-childcare-preflight.mjs';

export const PA_CHILDCARE_ODATA_METADATA_URL = 'https://data.pa.gov/api/odata/v4/$metadata';
export const PA_CHILDCARE_ODATA_METADATA_VERSION = 'pa-childcare-odata-metadata-receipt@1.0.0';
export const PA_CHILDCARE_ODATA_METADATA_REGISTRATION_SHA256 = '0809ef2ff6cdf77bd3bdbb8d83fec5f2c90cc2436c7be26a9e848dfbe4ab5f49';
const MAXIMUM = 2_000_000;
const EDM = 'http://docs.oasis-open.org/odata/ns/edm';
const EDMX = 'http://docs.oasis-open.org/odata/ns/edmx';
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (value, label) => { if (!value) throw Object.assign(new Error(`PA OData metadata rejected: ${label}.`), { code: 'PA_ODATA_METADATA_REJECTED' }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && equal(Object.keys(value).sort(), [...keys].sort());
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const entityTypeReference = value => typeof value === 'string' && /^(?:[A-Za-z_][A-Za-z0-9_]*\.)+ajn5-kaxt$/.test(value);
const claims = () => ({ provider_rows_requested: 0, provider_rows_retained: 0, entity_endpoint_requests: 0, pagination_verified: false, null_values_verified: false, current_operations_verified: false, acquisition_authorized: false, automatic_refresh_authorized: false, production_admission: false, current_pointer_written: false });
const gates = () => ['pagination-zero-row-probe-unsafe', 'regulated-childcare-versus-other-predicate', 'family-home-privacy', 'row-null-value-contract', 'monthly-snapshot-as-of-capture', 'row-and-mpi-location-id-conservation', 'zip5-and-zip4-separation', 'production-admission'];

function optionsCheck(options, keys) {
  check(options && typeof options === 'object' && !Array.isArray(options) && Reflect.ownKeys(options).every(key => keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value')), 'options');
  check(options.signal === undefined || options.signal instanceof AbortSignal, 'signal');
}

// This deliberately small CSDL reader accepts well-formed element/attribute XML,
// with namespace resolution, and never expands DTDs, external entities or CDATA.
function xmlTree(xml) {
  check(typeof xml === 'string' && Buffer.byteLength(xml) > 0 && Buffer.byteLength(xml) <= MAXIMUM && !/<!|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(xml), 'XML bounds or declaration');
  const source = xml.replace(/^\uFEFF?\s*<\?xml\s+[^?]*\?>/, '');
  const root = { children: [], namespaces: {} }, stack = [root];
  let cursor = 0, count = 0;
  const decode = value => value.replace(/&([^;]+);/g, (_match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    check(/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity), 'XML entity');
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    check(code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff), 'XML character');
    return String.fromCodePoint(code);
  });
  for (const match of source.matchAll(/<([^<>]+)>/g)) {
    check(!source.slice(cursor, match.index).trim(), 'XML text');
    cursor = match.index + match[0].length;
    const token = match[1];
    if (token.startsWith('/')) {
      check(/^\/[A-Za-z_][\w.:-]*\s*$/.test(token) && stack.length > 1 && token.slice(1).trim() === stack.at(-1).qname, 'XML close');
      stack.pop(); continue;
    }
    const head = /^([A-Za-z_][\w.:-]*)/.exec(token);
    check(head && ++count <= 50000 && stack.length <= 24, 'XML element bound');
    const selfClosing = /\/\s*$/.test(token), rest = token.slice(head[0].length).replace(/\/\s*$/, ''), attributes = {};
    let offset = 0;
    for (const attribute of rest.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g)) {
      check(!rest.slice(offset, attribute.index).trim() && !Object.hasOwn(attributes, attribute[1]), 'XML attribute');
      const raw = attribute[2] ?? attribute[3];
      check(!raw.replace(/&[^;]+;/g, '').includes('&'), 'XML ampersand');
      attributes[attribute[1]] = decode(raw); offset = attribute.index + attribute[0].length;
    }
    check(!rest.slice(offset).trim(), 'XML attribute syntax');
    const namespaces = { ...stack.at(-1).namespaces };
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'xmlns') namespaces[''] = value;
      else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
    }
    const parts = head[1].split(':'); check(parts.length <= 2, 'XML qualified name');
    const node = { qname: head[1], name: parts.at(-1), namespace: namespaces[parts.length === 2 ? parts[0] : ''], attributes, namespaces, children: [] };
    check(node.namespace === EDM || node.namespace === EDMX, 'CSDL namespace');
    stack.at(-1).children.push(node); if (!selfClosing) stack.push(node);
  }
  check(!source.slice(cursor).trim() && stack.length === 1 && root.children.length === 1, 'XML completeness');
  return root.children[0];
}
const children = (node, name, namespace = EDM) => node.children.filter(item => item.name === name && item.namespace === namespace);

export function parsePaChildcareOdataMetadata(xml) {
  const root = xmlTree(xml);
  check(root.name === 'Edmx' && root.namespace === EDMX && root.attributes.Version === '4.0', 'OData version');
  const services = children(root, 'DataServices', EDMX); check(services.length === 1, 'data services');
  const schemas = children(services[0], 'Schema');
  const matches = schemas.flatMap(schema => children(schema, 'EntityContainer').flatMap(container => children(container, 'EntitySet').filter(set => set.attributes.Name === 'ajn5-kaxt').map(set => ({ schema, set }))));
  check(matches.length === 1, 'dataset EntitySet');
  const type = matches[0].set.attributes.EntityType;
  check(entityTypeReference(type), 'entity type reference');
  const entities = schemas.flatMap(schema => children(schema, 'EntityType').filter(entity => `${schema.attributes.Namespace}.${entity.attributes.Name}` === type));
  check(entities.length === 1, 'dataset EntityType');
  const entity = entities[0], keys = children(entity, 'Key');
  check(keys.length === 1, 'entity key');
  const keyNames = children(keys[0], 'PropertyRef').map(key => key.attributes.Name);
  check(equal(keyNames, ['__id']), 'publisher row key');
  const properties = children(entity, 'Property');
  const selected = ['__id', ...PA_CHILDCARE_FIELDS].map(name => {
    const matches = properties.filter(property => property.attributes.Name === name); check(matches.length === 1, 'selected property uniqueness');
    const property = matches[0], nullable = property.attributes.Nullable ?? 'true';
    check(['true', 'false'].includes(nullable) && /^Edm\.[A-Za-z]+$/.test(property.attributes.Type ?? ''), 'selected property type/nullability');
    if (name !== 'geocoded_column') check(property.attributes.Type === 'Edm.String', 'selected string property');
    else check(['Edm.GeographyPoint', 'Edm.GeometryPoint'].includes(property.attributes.Type), 'selected point property');
    return { name, type: property.attributes.Type, nullable: nullable === 'true' };
  });
  check(selected[0].nullable === false, 'row key nullable');
  return { dataset_id: 'ajn5-kaxt', entity_type: type, keys: keyNames, selected_properties: selected, metadata_nullability_only: true };
}

const CONFIG = [
  ['config/connectors/pa-childcare-odata-metadata.json', '2239effae565abaabf7b4c53856307e66218c6c80e506b78692ae7b7014cf75a'],
  ['config/source-policies/pa-childcare-odata-metadata.json', 'dbabb305539134f4482759f87e5b9140c2752e3f14eb9cc0b15c1dd09b99293d'],
];
async function configuration(signal) {
  const result = {};
  for (const [file, pin] of CONFIG) {
    const hash = sha(JSON.stringify(await readJson(path.join(APP_ROOT, file), 100000, signal)));
    check(hash === pin, 'configuration drift'); result[file] = hash;
  }
  return result;
}

export function validatePaChildcareOdataMetadataReceipt(receipt) {
  check(exact(receipt, ['schema_version', 'status', 'observed_at', 'configuration', 'response', 'schema', 'unresolved_gates', 'claims']) && receipt.schema_version === PA_CHILDCARE_ODATA_METADATA_VERSION && receipt.status === 'selected-csdl-validated-pagination-held' && validTime(receipt.observed_at), 'receipt');
  check(equal(receipt.configuration, Object.fromEntries(CONFIG)), 'receipt configuration');
  check(exact(receipt.response, ['url', 'http_status', 'body_bytes', 'body_sha256']) && receipt.response.url === PA_CHILDCARE_ODATA_METADATA_URL && receipt.response.http_status === 200 && Number.isSafeInteger(receipt.response.body_bytes) && receipt.response.body_bytes > 0 && receipt.response.body_bytes <= MAXIMUM && digest(receipt.response.body_sha256), 'receipt response');
  const schema = receipt.schema;
  check(exact(schema, ['dataset_id', 'entity_type', 'keys', 'selected_properties', 'metadata_nullability_only']) && schema.dataset_id === 'ajn5-kaxt' && entityTypeReference(schema.entity_type) && equal(schema.keys, ['__id']) && schema.metadata_nullability_only === true && Array.isArray(schema.selected_properties) && schema.selected_properties.length === PA_CHILDCARE_FIELDS.length + 1, 'receipt schema');
  for (const [index, property] of schema.selected_properties.entries()) {
    check(exact(property, ['name', 'type', 'nullable']) && property.name === ['__id', ...PA_CHILDCARE_FIELDS][index] && typeof property.nullable === 'boolean' && (property.name === 'geocoded_column' ? ['Edm.GeographyPoint', 'Edm.GeometryPoint'].includes(property.type) : property.type === 'Edm.String'), 'receipt selected field');
  }
  check(schema.selected_properties[0].nullable === false && equal(receipt.claims, claims()) && equal(receipt.unresolved_gates, gates()), 'receipt claims');
  return receipt;
}

function race(promise, signal, late = () => {}) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { if (settled) { late(value); return; } settled = true; signal.removeEventListener('abort', abort); resolve(value); }, error => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); reject(error); });
  });
}
const cancel = response => { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); };

export async function preflightPaChildcareOdataMetadata(options = {}) {
  optionsCheck(options, ['fetchImpl', 'signal', 'now']);
  const { fetchImpl = fetch, signal, now = () => new Date() } = options;
  check(typeof fetchImpl === 'function' && typeof now === 'function', 'transport or clock'); signal?.throwIfAborted();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(Object.assign(new Error('PA OData metadata deadline.'), { code: 'PA_ODATA_METADATA_TIMEOUT' })), 30000);
  const active = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let response, reader;
  try {
    const config = await configuration(active);
    response = await race(Promise.resolve().then(() => { active.throwIfAborted(); return fetchImpl(PA_CHILDCARE_ODATA_METADATA_URL, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/xml', 'Accept-Encoding': 'identity' }, signal: active }); }), active, cancel);
    check(response instanceof Response && !response.redirected && (!response.url || response.url === PA_CHILDCARE_ODATA_METADATA_URL), 'HTTP response identity');
    if ([429, 503].includes(response.status)) throw Object.assign(new Error('PA OData publisher deferred; no retry.'), { code: 'PA_ODATA_METADATA_DEFERRED' });
    check(response.status === 200 && /^(?:application|text)\/xml(?:;|$)/i.test(response.headers.get('content-type') ?? ''), 'HTTP status/content type');
    const length = response.headers.get('content-length');
    check(length === null || /^\d+$/.test(length) && Number(length) <= MAXIMUM, 'declared response bound');
    check(response.body, 'response body'); reader = response.body.getReader();
    const chunks = []; let size = 0;
    for (;;) { const part = await race(reader.read(), active); active.throwIfAborted(); if (part.done) break; size += part.value.byteLength; check(size <= MAXIMUM, 'response body bound'); chunks.push(part.value); }
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    check(length === null || encoding && encoding !== 'identity' || Number(length) === size, 'response completeness');
    const raw = Buffer.concat(chunks, size), schema = parsePaChildcareOdataMetadata(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    check(equal(config, await configuration(active)), 'configuration drift'); active.throwIfAborted();
    return validatePaChildcareOdataMetadataReceipt({ schema_version: PA_CHILDCARE_ODATA_METADATA_VERSION, status: 'selected-csdl-validated-pagination-held', observed_at: now().toISOString(), configuration: config, response: { url: PA_CHILDCARE_ODATA_METADATA_URL, http_status: 200, body_bytes: size, body_sha256: sha(raw) }, schema, unresolved_gates: gates(), claims: claims() });
  } catch (error) {
    signal?.throwIfAborted();
    throw Object.assign(new Error('PA OData metadata preflight failed. Inspect service schema and response bounds; entity requests remain disabled.'), { code: error?.code === 'PA_ODATA_METADATA_DEFERRED' ? error.code : 'PA_ODATA_METADATA_FAILED' });
  } finally { clearTimeout(timer); if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } else cancel(response); }
}

export async function writePaChildcareOdataMetadataReceipt(receipt, options = {}) {
  optionsCheck(options, ['signal', 'outputRoot']);
  const { signal, outputRoot = path.join(APP_ROOT, 'data/business-sources/pa-childcare-centers/odata-metadata-preflights') } = options;
  const snapshot = structuredClone(receipt); validatePaChildcareOdataMetadataReceipt(snapshot); await configuration(signal);
  const raw = Buffer.from(JSON.stringify(snapshot) + '\n'); check(raw.length <= 100000, 'receipt bound'); signal?.throwIfAborted();
  await canonical(outputRoot, { output: true, signal }); await canonical(outputRoot, { create: true, output: true, signal });
  const directory = await lstat(outputRoot, { bigint: true }), id = randomUUID(), temporary = path.join(outputRoot, `${id}.tmp`), destination = path.join(outputRoot, `${id}.json`);
  let identity, published = false;
  const owned = value => value?.isFile() && !value.isSymbolicLink() && value.nlink === 1n && value.ino === identity?.ino && value.dev === identity?.dev;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { identity = await handle.stat({ bigint: true }); await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
    const meter = {}, reread = await readJson(temporary, 100000, signal, meter);
    validatePaChildcareOdataMetadataReceipt(reread); check(equal(snapshot, reread) && meter.sha256 === sha(raw) && owned(meter.identity), 'written receipt');
    await configuration(signal); await canonical(outputRoot, { output: true, signal });
    const current = await lstat(outputRoot, { bigint: true }), file = await lstat(temporary, { bigint: true });
    check(current.ino === directory.ino && current.dev === directory.dev && owned(file) && file.size === meter.identity.size && file.mtimeNs === meter.identity.mtimeNs && file.ctimeNs === meter.identity.ctimeNs, 'publication ownership');
    signal?.throwIfAborted(); await link(temporary, destination); published = true; await unlink(temporary);
    check(owned(await lstat(destination, { bigint: true })), 'published receipt');
    return { path: destination, bytes: raw.length, sha256: sha(raw) };
  } catch (error) {
    if (published) throw Object.assign(new Error('PA OData receipt may already exist; preserve output and inspect before repeating.'), { code: 'PA_ODATA_PUBLICATION_INCOMPLETE', path: destination });
    const current = await lstat(outputRoot, { bigint: true }).catch(() => null);
    if (current?.ino === directory.ino && current?.dev === directory.dev && owned(await lstat(temporary, { bigint: true }).catch(() => null))) {
      await canonical(outputRoot, { output: true }); await unlink(temporary);
    }
    throw error;
  }
}

export async function verifyPaChildcareOdataMetadataReceiptFile(file, options = {}) {
  optionsCheck(options, ['signal', 'expected']);
  const { signal, expected } = options;
  check(typeof file === 'string' && file === path.resolve(file) && exact(expected, ['path', 'bytes', 'sha256']) && expected.path === path.relative(APP_ROOT, file).split(path.sep).join('/') && !expected.path.startsWith('../') && Number.isSafeInteger(expected.bytes) && expected.bytes > 0 && expected.bytes <= 100000 && digest(expected.sha256), 'receipt file descriptor');
  await configuration(signal);
  const meter = {}, receipt = await readJson(file, 100000, signal, meter);
  check(meter.bytes === expected.bytes && meter.sha256 === expected.sha256, 'retained receipt hash/bytes');
  validatePaChildcareOdataMetadataReceipt(receipt);
  await configuration(signal); signal?.throwIfAborted();
  return { verified: true, receipt, receipt_path: file, receipt_bytes: meter.bytes, receipt_sha256: meter.sha256 };
}

export async function readRegisteredPaChildcareOdataMetadata(options = {}) {
  optionsCheck(options, ['signal', 'registrationPath']);
  const { signal, registrationPath = path.join(APP_ROOT, 'config/datasets/pa-childcare-odata-metadata.json') } = options;
  const before = {}, registration = await readJson(registrationPath, 10000, signal, before);
  check(sha(JSON.stringify(registration)) === PA_CHILDCARE_ODATA_METADATA_REGISTRATION_SHA256, 'registered metadata configuration pin');
  const file = path.resolve(APP_ROOT, registration.receipt.path);
  const result = await verifyPaChildcareOdataMetadataReceiptFile(file, { expected: registration.receipt, signal });
  check(result.receipt.observed_at === registration.observed_at && result.receipt.response.url === registration.source_response.url && result.receipt.response.body_bytes === registration.source_response.bytes && result.receipt.response.body_sha256 === registration.source_response.sha256, 'registered source observation');
  const after = {}, reread = await readJson(registrationPath, 10000, signal, after);
  check(before.sha256 === after.sha256 && equal(registration, reread), 'registration changed');
  return { ...result, registration };
}
