import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/broad-organization-authorization-program.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const ordinary = (key) => ({ gate_key: key, original_gate_kind: "non-row-bearing-contract-evidence", gate_kind: "non-row-bearing-contract-evidence", effective_gate_kind: "contract-evidence", taxonomy_version: "1.0.0", evidence_requirement: "Schema-only documentation", closure_state: "unresolved", readiness_uplift: false, authority_implication: false, document_closable: true, automatic_closure_permitted: false, row_bearing: false, required_evidence_type: "Schema-only documentation", acceptance_criterion: "Fields are documented without row data.", grants_authority: false });
const approval = { gate_key: "separate-acquisition-authorization", original_gate_kind: "non-row-bearing-contract-evidence", gate_kind: "non-row-bearing-contract-evidence", effective_gate_kind: "authenticated-operator-authorization", taxonomy_version: "1.0.0", evidence_requirement: "Separate authenticated operator decision for the exact scope.", closure_state: "unresolved", readiness_uplift: false, authority_implication: false, document_closable: false, automatic_closure_permitted: false, row_bearing: false };
const state = (abbr, name, priority, wave, gates = [ordinary("schema")]) => ({ priority, wave, state_abbreviation: abbr, state_name: name, unresolved_gates: gates.map((gate) => gate.gate_key), required_exclusions: ["Person-linked fields"], status_limitations: ["Status does not independently establish current operation."], address_limitations: ["Reported address is not a confirmed operating site."], gate_items: gates });
const view = (states = [state("IL", "Illinois", 1, 1, [ordinary("schema"), approval]), state("MS", "Mississippi", 2, 1), state("AL", "Alabama", 11, 2)]) => ({
  schema_version: "broad-organization-authorization-program-management-view@3.0.0", available: true,
  metadata: { release_id: "program-fixture", observed_at: "2026-09-23T15:28:41.546Z", jurisdiction_count: 40, gate_item_count: 355, gate_key_count: 37, gate_readiness: { taxonomy_version: "1.0.0", distinct_keys_classified: 37, taxonomy_exhaustive: true, unresolved_gate_item_count: 355, readiness_uplift: false }, wave_state_abbreviations: [["KS", "AR", "IL", "MS", "KY", "HI", "NV", "UT", "WA", "OK"], ["AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"], ["MI", "MN", "MO", "MT", "NC", "ND", "NH", "NJ", "NM", "OH"], ["RI", "SC", "SD", "TN", "VA", "VT", "WI", "WV", "WY", "NE"]] },
  source_lineage: { backlog_release_id: "backlog-fixture", backlog_manifest_sha256: "a".repeat(64), backlog_artifact_sha256: "b".repeat(64), assessment_catalog_id: "catalog-fixture", assessment_catalog_sha256: "c".repeat(64), source_matrix_release_id: "matrix-fixture", source_matrix_manifest_sha256: "d".repeat(64), source_matrix_artifact_sha256: "e".repeat(64) },
  authority: { approval_granted: false, acquisition_authorized: false, evidence_request_authorized: false, contact_authorized: false, download_authorized: false, payment_authorized: false, record_request_authorized: false, row_bearing_evidence_authorized: false, production_change_authorized: false, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, evidence_specification_is_approval: false },
  states,
});

function fixture(runnerJson) {
  const slots = [], refs = [], effects = [], calls = [];
  let index = 0;
  const exports = {};
  runInNewContext(code, {
    exports, AbortController, window: globalThis,
    require: (name) => name === "./runner-client" ? { runnerJson: (...args) => { calls.push(args); return runnerJson(...args); } }
      : name === "react" ? {
        useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }]; },
        useRef(initial) { const slot = index++; if (!(slot in refs)) refs[slot] = { current: initial }; return refs[slot]; },
        useCallback(callback) { index += 1; return callback; },
        useEffect(effect) { index += 1; effects.push(effect); },
      }
        : name === "react/jsx-runtime" ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" }
          : { __esModule: true, default: () => null },
  });
  return { calls, mount() { const tree = this.render(); for (const effect of effects.splice(0)) effect(); return tree; }, render() { index = 0; return exports.default(); } };
}
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const textOf = (tree) => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(textOf).join(" ") : tree && typeof tree === "object" ? textOf(tree.props?.children) : "";
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("program panel loads bounded view, requires a wave before state filter, and distinguishes approval-only gates", async () => {
  const f = fixture(async (url, options) => { assert.equal(url, "/api/data-operations/broad-organization-authorization-program"); assert.ok(options.signal); return view(); });
  f.mount(); await settle();
  let tree = f.render();
  assert.match(textOf(tree), /40 jurisdictions · 355 unresolved gate items · 37 gate keys/);
  assert.match(textOf(tree), /Source actions performed: 0/);
  assert.match(textOf(tree), /Network requests: 0/);
  assert.match(textOf(tree), /matrix-fixture/);
  let selects = nodes(tree).filter((node) => node.type === "select");
  assert.equal(selects[1].props.disabled, true);
  selects[0].props.onChange({ target: { value: "1" } }); tree = f.render();
  assert.match(textOf(tree), /authenticated operator authorization.*unresolved/);
  assert.match(textOf(tree), /contract evidence.*unresolved/);
  assert.match(textOf(tree), /Document-only closure:\s*not sufficient/);
  selects = nodes(tree).filter((node) => node.type === "select");
  assert.deepEqual(nodes(selects[1]).filter((node) => node.type === "option").map((item) => item.props.value), ["", "KS", "AR", "IL", "MS", "KY", "HI", "NV", "UT", "WA", "OK"]);
  selects[0].props.onChange({ target: { value: "2" } }); tree = f.render();
  selects = nodes(tree).filter((node) => node.type === "select");
  assert.deepEqual(nodes(selects[1]).filter((node) => node.type === "option").map((item) => item.props.value), ["", "AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"]);
  selects[1].props.onChange({ target: { value: "AL" } }); tree = f.render();
  assert.match(textOf(tree), /Alabama/);
  assert.doesNotMatch(textOf(tree), /Alaska|District of Columbia/);
  assert.deepEqual(nodes(tree).filter((node) => node.type === "button").map((node) => textOf(node)), ["Recheck verified program"]);
  assert.equal(f.calls.length, 1);
});

test("program panel fails closed and displays no stale packet details", async () => {
  const f = fixture(async () => { throw new Error("verification failed"); });
  f.mount(); await settle();
  const tree = f.render();
  assert.match(textOf(tree), /canonical authorization program is unavailable or failed verification/);
  assert.doesNotMatch(textOf(tree), /program-fixture|backlog-fixture|Schema-only documentation/);
});

test("program panel discards stale responses after recheck", async () => {
  const pending = [];
  const f = fixture(() => new Promise((resolve) => pending.push(resolve)));
  f.mount(); await settle();
  let tree = f.render();
  nodes(tree).find((node) => node.type === "button" && textOf(node) === "Recheck verified program").props.onClick();
  pending[1](view([state("AL", "Alabama", 11, 2)])); await settle();
  tree = f.render();
  nodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Filter authorization program wave").props.onChange({ target: { value: "2" } });
  pending[0](view([state("IL", "Illinois", 1, 1)])); await settle();
  tree = f.render();
  assert.match(textOf(tree), /Alabama/);
  assert.doesNotMatch(textOf(tree), /Wave 1 · IL/);
});
