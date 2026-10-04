/**
 * Versioned exact-key taxonomy for the current broad-organization authorization
 * program. This is a read-time interpretation only; it does not mutate source
 * releases or close any gate.
 */
export const BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY_VERSION = "1.0.0";

// Exact current catalog keys. Any newly introduced key requires a reviewed
// taxonomy update; there is deliberately no prefix/substring fallback.
const CONTRACT_KEYS = `
active-address-domain active-deletion-and-replay active-file-number-lifecycle active-predicate active-product-controlling-license actual-package-freshness authorized-source-package automated-retrieval-authorization
address-role address-role-and-zip-contract agreement-rights api-route-and-version-clarification archive-and-replay-guarantees automation
bid-lifecycle-and-bulk-mapping bulk-identifier-lifecycle bulk-layout-and-identifier-mapping bulk-product-existence bulk-schema-and-key-lifecycle
bulk-schema-and-scope bulk-scope-and-schema bulk-specific-terms-reconciliation bulk-status-and-address-mapping bulk-status-selection
bulk-status-type-date-mapping business-type-scope change-and-replay-contract change-contract change-deletion-replay-contract change-replay
change-replay-contract checksums-and-control-totals commercial-purpose-list-constraints complete-population complete-snapshot-route
conflicting-product-descriptions control-totals controlling-bulk-rights corporate-product-scope counts-and-checksums csv-schema
current-bulk-delivery-contract current-bulk-route current-delivery-counts current-extract-schema current-file-counts-and-checksums
current-layout-compatibility current-master-scope current-price-and-terms current-price-contract current-schema current-schema-continuity
custom-extract-schema delivery-and-rights derived-rights deterministic-workbook-extraction eligible-business-address-availability exact-delivered-population
exact-population-and-entity-scope exhaustive-status-vocabulary existing-product-and-price existing-product-confirmation export-existence
full-delta-deletion-replay-contract full-export-terms-and-completeness identifier-lifecycle identifier-status-address-contract independent-package-verification ink-contract
machine-readable-schema migration-continuity operator-supplied-complete-same-run-package organization-address-role physical-site-validity platform-migration population-discrepancy price
price-and-rights privacy privacy-exclusions product-route-reconciliation product-specific-rights production-status-mapping
record-count-and-checksum-controls recurring-price-and-terms refresh-and-change-controls refresh-and-replay refresh-contract requester-eligibility
retention-and-downstream-use-rights retention-transformation-geocoding-derived-publication-redistribution-rights rights schema schema-encoding-and-version scope
scope-and-schema secure-transfer-and-replay snapshot-change-and-replay-contract snapshot-change-replay-contract
snapshot-cutoff-deletion-and-replay stable-filing-number-lifecycle stable-identifier stable-identifier-lifecycle status-and-biennial-election
source-authenticity source-authenticity-and-reproducible-extraction source-scope separate-acquisition-authorization separate-national-admission
status-codebook subscription-automation supported-automation supported-bulk-retrieval supported-delivery supported-unattended-delivery supported-unattended-ftp
unsigned-product-specific-terms weekly-change-and-replay-contract written-automation-permission written-commercial-reuse-permission zero-row-schema-layout
`.trim().split(/\s+/);

const CLASS_BY_KEY = Object.freeze({
  "authenticated-operator-authorization": [
    "separate-acquisition-authorization", "automated-retrieval-authorization",
    "written-automation-permission", "written-commercial-reuse-permission",
  ],
  "retained-source-package-evidence": [
    "authorized-source-package", "operator-supplied-complete-same-run-package",
    "current-file-counts-and-checksums", "current-delivery-counts", "record-count-and-checksum-controls",
    "checksums-and-control-totals", "counts-and-checksums", "control-totals",
  ],
  "reproducible-execution-verification-evidence": [
    "independent-package-verification", "actual-package-freshness", "deterministic-workbook-extraction",
    "source-authenticity", "source-authenticity-and-reproducible-extraction",
  ],
  "national-admission-decision": ["separate-national-admission"],
});

const CONTRACT = "contract-evidence";
const ALL_KEYS = new Set(CONTRACT_KEYS);
if (ALL_KEYS.size !== 121) throw new Error("Broad-organization gate taxonomy must declare exactly 121 unique keys.");
for (const keys of Object.values(CLASS_BY_KEY)) {
  for (const key of keys) {
    if (!ALL_KEYS.has(key)) throw new Error(`Taxonomy exception is not an exact declared gate key: ${key}`);
    if (keys.filter((candidate) => candidate === key).length !== 1) throw new Error(`Duplicate taxonomy exception: ${key}`);
  }
}

const CATEGORY_LABELS = Object.freeze({
  [CONTRACT]: { evidence_requirement: "Reviewed non-row-bearing contract, schema, scope, rights, or source-semantics evidence.", document_closable: true },
  "authenticated-operator-authorization": { evidence_requirement: "A separate authenticated operator decision for the exact reviewed scope; documents alone cannot grant authorization.", document_closable: false },
  "retained-source-package-evidence": { evidence_requirement: "The exact retained source package and its pinned delivery/control evidence; a description of a package is not the package.", document_closable: false },
  "reproducible-execution-verification-evidence": { evidence_requirement: "A reproducible, independently verifiable execution/package/freshness result bound to the exact retained input; prose alone is insufficient.", document_closable: false },
  "national-admission-decision": { evidence_requirement: "A separate explicit national-admission decision after the applicable evidence gates; documentation alone does not admit a source.", document_closable: false },
});

const entries = Object.fromEntries(CONTRACT_KEYS.map((key) => [key, Object.freeze({
  category: Object.entries(CLASS_BY_KEY).find(([, keys]) => keys.includes(key))?.[0] ?? CONTRACT,
})]));

export const BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY = Object.freeze({
  version: BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY_VERSION,
  entries: Object.freeze(entries),
});

export function classifyBroadOrganizationGateReadiness(gateKey) {
  const entry = BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY.entries[gateKey];
  if (!entry) throw new Error(`Unknown broad-organization gate key: ${String(gateKey)}`);
  const category = CATEGORY_LABELS[entry.category];
  return {
    taxonomy_version: BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY_VERSION,
    effective_gate_kind: entry.category,
    evidence_requirement: category.evidence_requirement,
    document_closable: category.document_closable,
    row_bearing: false,
    authority_implication: false,
    closure_state: "unresolved",
    readiness_uplift: false,
  };
}

export function validateBroadOrganizationGateReadinessTaxonomyKeys(gateKeys) {
  const actual = [...new Set(gateKeys)].sort();
  const expected = Object.keys(BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY.entries).sort();
  const unknown = actual.filter((key) => !BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY.entries[key]);
  const unused = expected.filter((key) => !actual.includes(key));
  if (unknown.length || unused.length || actual.length !== 121) {
    throw new Error(`Gate taxonomy/program key mismatch (unknown=${unknown.join(",")}; unused=${unused.join(",")}; actual=${actual.length}).`);
  }
  return { distinct_gate_key_count: actual.length, exhaustive: true };
}
