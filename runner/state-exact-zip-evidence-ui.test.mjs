import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/state-exact-zip-evidence-panel.tsx", import.meta.url), "utf8");
const nodes = (value) => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const text = (value) => value == null || typeof value === "boolean" ? "" : typeof value !== "object" ? String(value) : Array.isArray(value) ? value.map(text).join("") : text(value.props?.children);
function harness(request) {
  const values = [], effects = [], cleanups = [], dependencies = []; let cursor = 0, effectCursor = 0;
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, AbortController, encodeURIComponent,
    require: (name) => name === "./runner-client" ? { runnerJson: request } : name === "react" ? {
      useState: (initial) => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next) => values[index] = next]; },
      useEffect: (effect, next) => { const index = effectCursor++; if (!dependencies[index] || next.some((item, offset) => item !== dependencies[index][offset])) { dependencies[index] = next; effects.push(() => { cleanups[index]?.(); cleanups[index] = effect(); }); } },
    } : require(name),
  });
  return { exports, render: (props) => { cursor = 0; effectCursor = 0; const tree = exports.default(props); effects.splice(0).forEach((run) => run()); return tree; }, close: () => cleanups.forEach((cleanup) => cleanup?.()) };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const statuses = ["positive", "measured-zero", "outside-source-denominator", "absent-from-retained-source-rows", "unavailable"];
const lifecycles = ["source-defined-current-positive-within-review-window", "source-defined-current-without-positive-evidence", "non-active-reporting-positive", "non-active-reporting-without-positive-evidence", "stale", "unmeasured", "unmapped"];
function view(state = "MD") {
  const joined = Object.fromEntries(statuses.flatMap((cell) => lifecycles.map((lifecycle) => [`${cell}|${lifecycle}`, cell === "positive" && lifecycle === "source-defined-current-positive-within-review-window" ? 2 : 0])));
  return { schema_version: "state-exact-zip-industry-evidence-disposition@1.1.0", status: "present", release_id: "state-exact-zip-industry-evidence-disposition-fixture", manifest_sha256: "a".repeat(64), source_bytes_read: 100, full_matrix_replay_performed: false, scope_id: `state:${state}`, scope_label: "Maryland state disposition",
    geography_scope_counts: { state: 33455, territory: 149, "multi-state-material": 184, "zcta-overlay-unresolved": 3, "non-zcta-unassigned": 14402, "explicit-placeholder": 1 },
    row: { scope_id: `state:${state}`, scope_label: "Maryland state disposition", state_geo_id: "state:24", state_fips: "24", state_name: "Maryland", postal_abbreviation: state, zip5_rows: 2, zcta_linked_zip5_rows: 2, dimensions: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`source-${index}`, { source_id: `source-${index}`, zip5_rows: 2, count_sum: 2, by_cell_status: { positive: 2, "measured-zero": 0, "outside-source-denominator": 0, "absent-from-retained-source-rows": 0, unavailable: 0 }, by_lifecycle_status: { "source-defined-current-positive-within-review-window": 2, "source-defined-current-without-positive-evidence": 0, "non-active-reporting-positive": 0, "non-active-reporting-without-positive-evidence": 0, stale: 0, unmeasured: 0, unmapped: 0 }, joined: { cell_total: 2, numeric_cell_count: 2, null_cell_count: 0, evidence_count: 2, by_cell_status_and_lifecycle: joined } }])) },
    claims: { polygon_area_only_not_business_location: true, usps_zip_state_assignment: false, fractional_allocation: false, current_operation_verified: false, additive_cross_industry_total: false, network_requests: 0, current_pointer_written: false, production_enrollment: false } };
}

test("state evidence panel preserves the independent availability denominator and unassigned scopes", async () => {
  const h = harness(async () => view());
  h.render({ state: "MD" }); await flush(); const tree = h.render({ state: "MD" }), value = text(tree);
  assert.match(value, /40 retained source dimensions/);
  assert.match(value, /joined dispositions/);
  assert.match(value, /positive \/ source-defined-current-positive-within-review-window: 2/);
  assert.match(value, /Source-defined current/);
  assert.match(value, /Non-active reporting/);
  assert.match(value, /184 material multi-state ZCTAs/);
  assert.match(value, /3 unresolved ZCTA overlays/);
  assert.match(value, /14,402 non-ZCTA keys/);
  assert.match(value, /independent of the 8\/11-dataset availability denominator/);
  assert.match(value, /not businesses, all-business completeness, or verified current operation/);
  assert.equal(nodes(tree).filter((node) => node.props?.scope === "row").length, 40);
  h.close();
});

test("state evidence panel rejects scope drift and never shows stale state evidence", async () => {
  let resolve; const h = harness(() => new Promise((done) => { resolve = done; }));
  h.render({ state: "MD" }); const loading = h.render({ state: "VA" });
  assert.match(text(loading), /Loading state exact-ZIP evidence/);
  resolve(view("MD")); await flush();
  assert.doesNotMatch(text(h.render({ state: "VA" })), /Maryland exact-ZIP/);
  h.close();
});

test("state exact-ZIP validator fails closed on joined and geography conservation drift", () => {
  const h = harness(async () => view()); const valid = view();
  assert.equal(h.exports.validStateExactZipEvidence(valid, "MD"), true);
  for (const mutate of [
    (item) => { item.geography_scope_counts["non-zcta-unassigned"]--; },
    (item) => { item.row.dimensions["source-0"].joined.cell_total++; },
    (item) => { item.row.dimensions["source-0"].joined.by_cell_status_and_lifecycle["positive|stale"]++; item.row.dimensions["source-0"].joined.by_cell_status_and_lifecycle["positive|within-review-window"]--; },
    (item) => { item.claims.current_operation_verified = true; },
  ]) { const invalid = structuredClone(valid); mutate(invalid); assert.equal(h.exports.validStateExactZipEvidence(invalid, "MD"), false); }
});

test("State Completion mounts the panel once and Industry Summary does not duplicate it", async () => {
  const workspace = await readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8");
  assert.equal(workspace.match(/<StateExactZipEvidencePanel state=\{state\} \/>/g)?.length, 1);
  assert.match(workspace, /\{!industries && mapMode === "availability" && <StateExactZipEvidencePanel state=\{state\} \/>\}/);
});
