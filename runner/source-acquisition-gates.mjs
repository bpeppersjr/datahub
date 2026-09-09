/**
 * Source prerequisites are not collection jobs. A listed source is not an
 * authorization for collection. Oklahoma schema and Overture runtime/metadata checks
 * are separate prerequisites; Nebraska remains blocked with no worker fallback.
 */
const NE_PDF_GATE = Object.freeze({
  sourceId: 'ne-childcare-pdf',
  state: 'NE',
  industry: 'childcare',
  status: 'BLOCKED_SOURCE_POLICY',
  reasonCode: 'SOURCE_POLICY_UNRESOLVED',
  reason: 'Nebraska DHHS offers a public roster PDF, but the linked portal copying and automation terms have unresolved applicability. Obtain source-specific clarification before automated PDF capture.',
  sourceUrl: 'https://dhhs.ne.gov/licensure/Documents/ChildCareRoster.pdf',
  evidence: Object.freeze([
    'https://dhhs.ne.gov/Pages/Search-for-Child-Care-Providers.aspx',
    'https://dhhs.ne.gov/Pages/Policies.aspx',
    'https://www.nebraska.gov/policies/',
  ]),
  reviewDocument: 'docs/states/NE-PDF-INTERNAL-USE-2026-09-09.md',
  captureImplemented: false,
  sourceBodyAcquired: false,
  publicExportAuthorized: false,
  currentOperationsVerified: false,
  nextAction: 'Resolve the source-specific policy scope, then implement and verify bounded app-owned PDF capture and document validation. Do not treat HTTP Last-Modified as the roster edition.',
});

export function getSourcePrerequisiteGates() {
  return structuredClone([NE_PDF_GATE, {
    sourceId: 'ok-childcare-schema', state: 'OK', industry: 'childcare',
    status: 'READY_SCHEMA_PREREQUISITE', schemaProbeImplemented: true, collectionReady: false,
    publicExportAuthorized: false, currentOperationsVerified: false,
    sourceUrl: 'https://childcarefind.okdhs.org/providers?zip-code=73102&facility-type=childcare-center',
    reviewDocument: 'docs/states/OK-SOURCE-USE-2026-09-09.md',
    reason: 'One fixed center/ZIP aggregate schema check, not a statewide acquisition or refresh.',
    nextAction: 'Run the bounded prerequisite through the app; verify broader delivery and temporal semantics before collection enrollment.',
  }, {
    sourceId: 'overture-httpfs-runtime', state: null, industry: null,
    status: 'READY_RUNTIME_PREREQUISITE', runtimePrerequisiteImplemented: true, collectionReady: false,
    publicExportAuthorized: false, currentOperationsVerified: false,
    sourceUrl: 'https://extensions.duckdb.org/v1.5.5/windows_amd64/httpfs.duckdb_extension.gz',
    reviewDocument: 'docs/OVERTURE-HTTPFS-RUNTIME.md',
    reason: 'Fixed Windows DuckDB dependency installation and signature check; not an Overture place acquisition.',
    nextAction: 'Run the bounded runtime prerequisite through the app. Retain its verified artifacts for future workers; large source acquisition remains separately gated.',
  }, {
    sourceId: 'overture-source-preflight', state: null, industry: null,
    status: 'READY_METADATA_PREREQUISITE', metadataPrerequisiteImplemented: true, collectionReady: false,
    publicExportAuthorized: false, currentOperationsVerified: false,
    sourceUrl: 'https://stac.overturemaps.org/catalog.json',
    reviewDocument: 'docs/OVERTURE-SOURCE-PREFLIGHT.md',
    reason: 'Bounded latest-release STAC metadata validation only; no place assets are requested.',
    nextAction: 'Run through the app and retain the independently replayed metadata receipt. Large acquisition remains separately gated.',
  }]);
}

export function assertSourcePrerequisiteAllowed(input) {
  const plain = input && Object.getPrototypeOf(input) === Object.prototype;
  const keys = plain ? Reflect.ownKeys(input) : [];
  const descriptor = plain ? Object.getOwnPropertyDescriptor(input, 'sourceId') : undefined;
  if (!plain || keys.length !== 1 || keys[0] !== 'sourceId' || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== NE_PDF_GATE.sourceId) {
    throw Object.assign(new Error('Source prerequisite requires exactly sourceId: ne-childcare-pdf; no paths, URLs or approval overrides are accepted.'), {statusCode: 400, code: 'INVALID_SOURCE_PREREQUISITE'});
  }
  throw Object.assign(new Error(NE_PDF_GATE.reason), {statusCode: 409, code: NE_PDF_GATE.reasonCode});
}
