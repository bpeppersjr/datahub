const VERSION = 'retained-childcare-registry-input@1.0.0';
export const RETAINED_CHILDCARE_SOURCE_IDS = Object.freeze({
  'state-pa-childcare-centers': 'pa-dhs-childcare-centers',
  'state-ct-childcare-centers': 'ct-oec-childcare-centers',
  'state-md-childcare-centers': 'md-msde-childcare-centers',
  'state-vt-childcare-centers': 'vt-cdd-childcare-centers',
  'state-co-childcare-centers': 'co-cdec-childcare-centers',
  'state-ut-childcare-centers-retained': 'ut-dlbc-childcare-centers',
  'state-ia-childcare-centers': 'ia-childcare-centers',
});

// Read only the published address-state projection, never publisher scope or
// local enrollment. A zero contributes no positive state-address evidence.
export function retainedChildcareStateCount(row, declaration, sourceKey) {
  const sourceId = RETAINED_CHILDCARE_SOURCE_IDS[sourceKey];
  if (!sourceId) return null;
  const value = row.retained_childcare_reporting;
  if (declaration === undefined && value === undefined) return null;
  const valid = declaration?.schema_version === VERSION && value?.schema_version === VERSION
    && value.export_policy === 'internal' && value.identity_matching_eligible === false
    && value.publisher_scope_assigns_address_state === false
    && Number.isSafeInteger(value.candidate_rows) && value.candidate_rows >= 0
    && Array.isArray(value.by_source);
  if (!valid) throw new Error('Published retained childcare state evidence is invalid.');
  const seen = new Set(); let total = 0;
  for (const item of value.by_source) {
    if (!Object.values(RETAINED_CHILDCARE_SOURCE_IDS).includes(item.dataset_id)
      || seen.has(item.dataset_id) || !Number.isSafeInteger(item.candidate_rows) || item.candidate_rows < 0)
      throw new Error('Published retained childcare source count is invalid.');
    seen.add(item.dataset_id); total += item.candidate_rows;
  }
  if (!Number.isSafeInteger(total) || total !== value.candidate_rows)
    throw new Error('Published retained childcare state counts do not reconcile.');
  return value.by_source.find(item => item.dataset_id === sourceId)?.candidate_rows ?? 0;
}
