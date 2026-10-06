import { readNationalZipGoalAcceptance } from './national-zip-goal-acceptance.mjs';

const SHA = /^[a-f0-9]{64}$/;
const PINS = Object.freeze({
  registry_manifest: 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76',
  coverage_manifest: 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6',
  geography_manifest: '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b',
  registry_zip_membership: '2bd91afb013e99203ccea4c6cd9e8d3182d4071918ab34d27bcdd8ad3344006e',
  zcta_index: '41cbef263f88514d6c6e139e54527350c23f9e05a96a9576a6d7b2478f28ffc6',
  usps_candidate_catalog: '01f633315d96037140bbc52476a666f287ceb662c692bbd401e811ea6752f7f6',
});
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const fail = () => { throw Error('National report-only ZIP objective projection rejected.'); };
const check = value => { if (!value) fail(); };

export function projectNationalZipReportOnlyObjective(report) {
  check(report?.schema_version === 'national-zip-goal-acceptance@1.7.0'
    && report.evidence_mode === 'retained-current-source-membership'
    && report.requested_claim === 'report-only'
    && exactKeys(report.acceptance, ['accepted', 'blockers', 'blocker_details'])
    && report.acceptance.accepted === true && report.acceptance.blockers?.length === 0 && report.acceptance.blocker_details?.length === 0);
  const source = report.source_reported_zip_membership, usps = report.authoritative_current_operational_usps_zip_denominator;
  check(exactKeys(source, ['zip_union_count','zip_union_member_set_sha256','with_record_level_source_contribution','contribution_member_set_sha256','denominator_only_count','outside_selected_zcta_count','source_contributed_outside_selected_zcta_count','denominator_only_outside_selected_zcta_count','includes_explicit_00000_placeholder','operational_zip_validity_verified','scope'])
    && SHA.test(source.zip_union_member_set_sha256) && SHA.test(source.contribution_member_set_sha256)
    && source.zip_union_count === 48194 && source.with_record_level_source_contribution === 47995
    && source.denominator_only_count === 199 && source.outside_selected_zcta_count === 14403
    && source.source_contributed_outside_selected_zcta_count === 14361
    && source.denominator_only_outside_selected_zcta_count === 41
    && source.includes_explicit_00000_placeholder === true && source.operational_zip_validity_verified === false
    && source.with_record_level_source_contribution + source.denominator_only_count === source.zip_union_count
    && source.source_contributed_outside_selected_zcta_count + source.denominator_only_outside_selected_zcta_count + 1 === source.outside_selected_zcta_count);
  check(exactKeys(usps, ['denominator','candidate_production_admission','admission_status','member_set_verification','complete_current_area_district_assignment_set_accepted','every_valid_zip_completion_accepted','complete_current_delivery_zip_registry','scope','blockers'])
    && usps.denominator === null && usps.candidate_production_admission === false && usps.admission_status === 'not-admitted'
    && usps.member_set_verification === null && usps.complete_current_area_district_assignment_set_accepted === false
    && usps.every_valid_zip_completion_accepted === false && usps.complete_current_delivery_zip_registry === false
    && Array.isArray(usps.blockers) && usps.blockers.length === 1 && usps.blockers[0] === 'authoritative-current-usps-denominator-unavailable');
  check(report.all_business_completion_percent === null && report.current_operating_business_count === null
    && report.production_execution === false && report.publication_performed === false && report.network_requests === 0);
  check(exactKeys(report.bindings, ['registry_pointer','registry_manifest','coverage_pointer','coverage_manifest','geography_pointer','geography_manifest','usps_candidate_catalog','zcta_index','registry_zip_membership']));
  for (const [key, expected] of Object.entries(PINS)) check(report.bindings[key]?.sha256 === expected && SHA.test(expected));
  return {
    schema_version: 'national-zip-report-only-objective-view@1.0.0', status: 'accepted-report-only', accepted: true,
    zip_membership: { total: 48194, source_contributed: 47995, denominator_only: 199 },
    outside_selected_zcta: { total: 14403, source_reported: 14361, denominator_only: 41, explicit_00000: 1 },
    usps_operational_denominator: { value: null, candidate_admission_status: 'not-admitted' },
    claims: { all_business_completion_percent: null, current_operating_business_count: null, current_operation_verified: false },
    provenance: { acceptance_schema_version: report.schema_version, ...Object.fromEntries(Object.entries(PINS).map(([key, sha256]) => [key, { sha256 }])) },
  };
}

export async function nationalZipReportOnlyObjectiveHttp(request, response, url, json, { reader = readNationalZipGoalAcceptance, timeoutMs = 30000 } = {}) {
  const headers = request.headers ?? {};
  if (request.method !== 'GET' || url.searchParams.size !== 0 || headers['transfer-encoding'] !== undefined
      || (headers['content-length'] !== undefined && headers['content-length'] !== '0')) {
    response.setHeader?.('Connection', 'close'); json(response, 400, { error: 'National report-only ZIP objective requires an empty GET.' }); return;
  }
  const controller = new AbortController(); let disconnected = false;
  const abort = () => { if (!response.writableEnded && !response.destroyed) { disconnected = true; controller.abort(); } };
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  request.once?.('aborted', abort); response.once?.('close', abort); request.resume?.();
  try {
    controller.signal.throwIfAborted();
    const report = await reader({ claim: 'report-only', signal: controller.signal });
    controller.signal.throwIfAborted();
    const result = projectNationalZipReportOnlyObjective(report);
    if (!response.writableEnded && !response.destroyed) { response.setHeader?.('Cache-Control', 'no-store'); json(response, 200, result); }
  } catch {
    if (!disconnected && !response.destroyed && !response.writableEnded) json(response, 503, { error: 'National report-only ZIP objective evidence is unavailable or incompatible.' });
  } finally {
    clearTimeout(timer); request.removeListener?.('aborted', abort); response.removeListener?.('close', abort);
  }
}

export const NATIONAL_ZIP_REPORT_ONLY_OBJECTIVE_PINS = PINS;
