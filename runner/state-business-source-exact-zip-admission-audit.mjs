import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { DIMENSIONS } from "./broad-organization-zip-summary.mjs";
import { loadStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";

const STATES = Object.freeze(["CO", "CT", "DE", "FL", "IA", "NY", "OR", "PA"]);
const DIMENSION_IDS = Object.freeze(DIMENSIONS.map(({ id }) => id));
const PINS = Object.freeze({
  broadRegistration: "a8a70af7d6ad4c8dafeec80ed78ee097d85a6fa2dd6d6ecb2ecc6bf81dc53de7",
  broadRelease: "national-broad-organization-zip-summary-bb8ca12cdb429a520406d141319d2424569199a55a87469e37e94f52f2bb2b2c",
  broadManifest: "13600e6fc129d3e1ab3e7ce0a5cea1fbc7b9e8e352fd3d70b01a5d144a8c25e6",
  upstreamRelease: "broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2",
  upstreamManifest: "ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e",
  matrixRegistration: "ef3ef5b424d35df017f354066f0acc7eaa7f3ed2823cd34922c14a777fbcf568",
  matrixRelease: "national-exact-zip-industry-evidence-matrix-ada7e938a0bfa31a51b4cc165b0a3e357f025704eff853fb88a4ccadf2c9ceb6",
  matrixManifest: "743d1bad94a7e8b122969cbb0cb9618e20b820b4b1b5afb46285bd70458d9ffe",
});
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw Error(`State business source exact-ZIP admission audit rejected: ${message}.`); };
const check = (condition, message) => { if (!condition) fail(message); };
const sameSet = (actual, expected) => actual.length === expected.length && new Set(actual).size === actual.length && expected.every((item) => actual.includes(item));
const conservativeClaims = (claims) => claims?.network_requests === 0 && claims.production_enrollment === false && claims.current_operation_verified === false && claims.all_business_completeness === false;

async function pinnedJson(root, relative, expectedSha) {
  const absoluteRoot = path.resolve(root), absolute = path.resolve(absoluteRoot, relative);
  check(absolute.startsWith(`${absoluteRoot}${path.sep}`), `${relative} escapes root`);
  const bytes = await readFile(absolute);
  check(sha(bytes) === expectedSha, `${relative} hash drift`);
  return JSON.parse(bytes);
}

export function reconcileStateBusinessSourceExactZipAdmission({ catalog, broadRegistration, broadManifest, upstreamManifest, matrixRegistration, matrixManifest }) {
  const ready = catalog.states.filter((row) => row.production_ready === true);
  check(sameSet(ready.map((row) => row.state_abbreviation), STATES), "production-ready catalog publisher set drift");
  check(ready.every((row) => row.decision === "existing-governed-source" && row.broad_layer_production_ready === true && row.autonomous_acquisition_authorized === false), "catalog readiness authority drift");
  check(broadRegistration.production_enrollment === false && broadRegistration.runtime_pointer === null && broadRegistration.retained_release?.release_id === PINS.broadRelease && broadRegistration.retained_release.manifest_sha256 === PINS.broadManifest, "broad summary registration drift");
  check(matrixRegistration.production_enrollment === false && matrixRegistration.runtime_pointer === null && matrixRegistration.retained_release?.release_id === PINS.matrixRelease && matrixRegistration.retained_release.manifest_sha256 === PINS.matrixManifest, "exact matrix registration drift");
  check(broadManifest.release_id === PINS.broadRelease && broadManifest.bindings?.upstream_release?.release_id === PINS.upstreamRelease && broadManifest.bindings.upstream_release.manifest_sha256 === PINS.upstreamManifest, "broad release lineage drift");
  check(matrixManifest.release_id === PINS.matrixRelease, "matrix release drift");
  check(sameSet(Object.keys(upstreamManifest.source_contract ?? {}), STATES), "selected broad source_contract publisher set drift");
  check(sameSet(Object.keys(upstreamManifest.dependencies?.sources ?? {}), STATES), "selected source dependency set drift");
  check(sameSet(Object.keys(broadManifest.bindings?.sources ?? {}), STATES), "broad summary source binding set drift");
  check(sameSet((broadManifest.bindings?.dimensions ?? []).map((row) => row.id), DIMENSION_IDS), "broad summary dimension set drift");
  const matrixDimensions = (matrixManifest.bindings?.sources ?? []).filter((row) => String(row.id).startsWith("broad_org_"));
  check(sameSet(matrixDimensions.map((row) => row.id), DIMENSION_IDS), "exact matrix broad dimension set drift");
  check(DIMENSION_IDS.filter((id) => id.startsWith("broad_org_or_")).length === 2 && matrixDimensions.filter((row) => row.publisher_scope === "OR").map((row) => row.record_kind).sort().join("|") === "brand|registration", "Oregon legal/brand dimension mapping drift");
  for (const dimension of broadManifest.bindings.dimensions) {
    check(dimension.zip5_key === true && dimension.zip4_joined === false && dimension.current_operation_verified === false && dimension.additive_business_count === false, `${dimension.id} ZIP or claim contract drift`);
    const matrix = matrixDimensions.find((row) => row.id === dimension.id), source = broadManifest.bindings.sources[dimension.publisher_jurisdiction];
    check(matrix?.key === "zip5" && matrix.pointer_path === null && matrix.release_id === broadManifest.release_id && matrix.manifest_sha256 === PINS.broadManifest && matrix.publisher_scope === dimension.publisher_jurisdiction && matrix.record_kind === dimension.record_kind, `${dimension.id} matrix admission drift`);
    check(matrix.source_provenance?.normalized_release_id === source.normalized_release_id && matrix.source_provenance.normalized_manifest_sha256 === source.normalized_manifest_sha256 && matrix.source_provenance.source_release_id === source.source_release_id && matrix.source_provenance.policy_id === source.policy_id && matrix.source_provenance.policy_version === source.policy_version && matrix.source_provenance.policy_sha256 === source.policy_sha256 && matrix.source_provenance.zip4_joined === false, `${dimension.id} provenance/policy pin drift`);
    check(matrix.accepted_address_rows === broadManifest.summary.eligible_rows_by_dimension[dimension.id], `${dimension.id} eligible row conservation drift`);
  }
  for (const state of STATES) {
    const dependency = upstreamManifest.dependencies.sources[state], source = broadManifest.bindings.sources[state];
    check(dependency.source_release_id === source.normalized_release_id && dependency.source_manifest_sha256 === source.normalized_manifest_sha256 && dependency.policy_sha256 === source.policy_sha256 && typeof dependency.transformation === "string" && dependency.transformation.endsWith("@1.0.1"), `${state} transformation/dependency pin drift`);
  }
  const summary = broadManifest.summary;
  check(summary.input_records === upstreamManifest.conservation?.input_record_total && summary.address_rows === upstreamManifest.conservation.address_row_total, "input/address conservation drift");
  check(summary.address_rows === summary.eligible_address_rows + summary.missing_or_ineligible_address_rows, "eligible/missing-ineligible conservation drift");
  check(Object.values(summary.eligible_rows_by_dimension).reduce((sum, value) => sum + value, 0) === summary.eligible_address_rows, "dimension eligible conservation drift");
  check(Object.values(summary.missing_or_ineligible_rows_by_publisher).reduce((sum, value) => sum + value, 0) === summary.missing_or_ineligible_address_rows, "publisher ineligible conservation drift");
  check(conservativeClaims(broadManifest.claims) && broadManifest.claims.zip4_joined === false && conservativeClaims(matrixRegistration.claims) && matrixManifest.claims?.production_enrollment === false && matrixManifest.claims?.current_operation_verified === false && matrixManifest.claims?.all_business_completeness === false, "claim or production authority escalation");
  return { schema_version: "state-business-source-exact-zip-admission-audit@1.0.0", status: "reconciled-local-review-only", publishers: [...STATES], dimensions: [...DIMENSION_IDS], counts: { publishers: 8, dimensions: 9, input_records: summary.input_records, address_rows: summary.address_rows, eligible_address_rows: summary.eligible_address_rows, missing_or_ineligible_address_rows: summary.missing_or_ineligible_address_rows }, claims: { network_requests: 0, production_enrollment: false, current_operation_verified: false, all_business_completeness: false, zip4_joined: false } };
}

export async function auditStateBusinessSourceExactZipAdmission({ root = APP_ROOT, catalog } = {}) {
  root = path.resolve(root);
  const broadRegistration = await pinnedJson(root, "config/datasets/national-broad-organization-zip-summary.json", PINS.broadRegistration);
  const broadManifest = await pinnedJson(root, broadRegistration.retained_release.manifest, PINS.broadManifest);
  const upstreamManifest = await pinnedJson(root, broadManifest.bindings.upstream_release.manifest_path, PINS.upstreamManifest);
  const matrixRegistration = await pinnedJson(root, "config/datasets/national-exact-zip-industry-evidence-matrix.json", PINS.matrixRegistration);
  const matrixManifest = await pinnedJson(root, matrixRegistration.retained_release.manifest, PINS.matrixManifest);
  for (const source of Object.values(broadManifest.bindings.sources ?? {})) {
    await pinnedJson(root, source.normalized_manifest_path, source.normalized_manifest_sha256);
    await pinnedJson(root, source.policy_path, source.policy_sha256);
  }
  return reconcileStateBusinessSourceExactZipAdmission({ catalog: catalog ?? await loadStateBusinessSourceAssessmentCatalog(), broadRegistration, broadManifest, upstreamManifest, matrixRegistration, matrixManifest });
}
