import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/broad-organization-authorization-packet.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const requestItem = (state) => ({ request_item_id: `${state}-schema`, unresolved_gate: "schema", request_item_type: "non-row-bearing-evidence-specification", row_bearing: false, request_item: "Review schema documentation only.", required_evidence_type: "Header-only schema", acceptance_criterion: "No source rows and fields are classified.", action_boundary: { contact_authorized: false, contact_performed: false, download_authorized: false, download_performed: false, payment_authorized: false, payment_performed: false, record_request_authorized: false, records_requested: 0, row_bearing_evidence_authorized: false, production_change_authorized: false, no_contact: true, no_download: true, no_payment: true, no_record_request: true, no_contact_no_download_no_payment_no_record_request: true } });
const view = (states = ["AK", "DC"]) => ({
  schema_version: "broad-organization-authorization-packet-management-view@1.0.0", available: true,
  metadata: { release_id: "packet-fixture", observed_at: "2026-09-22", jurisdiction_count: 10, request_item_count: 2, first_wave_state_abbreviations: states },
  source_lineage: { backlog_release_id: "backlog-fixture", backlog_manifest_sha256: "a".repeat(64), backlog_artifact_sha256: "b".repeat(64), assessment_catalog_id: "catalog-fixture", assessment_catalog_sha256: "c".repeat(64) },
  authority: { approval_granted: false, acquisition_authorized: false, contact_authorized: false, download_authorized: false, payment_authorized: false, record_request_authorized: false, row_bearing_evidence_authorized: false, production_change_authorized: false, source_actions_performed: 0, contact_performed: false, download_performed: false, payment_performed: false, records_requested: 0, current_pointer_changed: false, evidence_specification_is_approval: false },
  states: states.map((code) => ({ state_abbreviation: code, state_name: code === "AK" ? "Alaska" : "District of Columbia", assessment_provenance: { assessment_id: `${code}-assessment`, assessment_kind: "source-discovery", observed_at: "2026-09-03" }, unresolved_gates: ["schema"], privacy_exclusions: ["Person-linked fields"], legal_status_limitations: ["Statuses are not proof of operation."], address_limitations: ["Reported address is not a physical site."], request_items: [requestItem(code)] })),
});

function fixture(runnerJson) {
  const slots = [], refs = [], effects = [], calls = [];
  let index = 0;
  const exports = {};
  runInNewContext(code, {
    exports,
    AbortController,
    window: globalThis,
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
  return {
    calls,
    mount() { const tree = this.render(); for (const effect of effects.splice(0)) effect(); return tree; },
    render() { index = 0; return exports.default(); },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const textOf = (tree) => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(textOf).join(" ") : tree && typeof tree === "object" ? textOf(tree.props?.children) : "";
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("read-only packet panel loads verified view, filters jurisdictions, and exposes no approval action", async () => {
  const f = fixture(async (url, options) => { assert.equal(url, "/api/data-operations/broad-organization-authorization-packet"); assert.ok(options.signal); return view(); });
  f.mount(); await settle();
  let tree = f.render();
  assert.match(textOf(tree), /Evidence specification only/);
  assert.match(textOf(tree), /No contact · no download · no payment · no record request/);
  assert.match(textOf(tree), /Acceptance criterion/);
  const select = nodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Filter authorization packet jurisdiction");
  assert.deepEqual(nodes(select).filter((node) => node.type === "option").map((item) => item.props.value), ["", "AK", "DC"]);
  const buttons = nodes(tree).filter((node) => node.type === "button");
  assert.deepEqual(buttons.map((button) => textOf(button)), ["Recheck verified packet"]);
  select.props.onChange({ target: { value: "DC" } }); tree = f.render();
  assert.match(textOf(tree), /District of Columbia/);
  assert.doesNotMatch(textOf(tree), /Alaska/);
  assert.equal(f.calls.length, 1);
});

test("packet panel fails closed when the management API cannot verify the release", async () => {
  const f = fixture(async () => { throw new Error("verification failed"); });
  f.mount(); await settle();
  const tree = f.render();
  assert.match(textOf(tree), /canonical authorization packet is unavailable or failed verification/);
  assert.doesNotMatch(textOf(tree), /packet-fixture|AK-assessment|Review schema documentation/);
});

test("packet panel ignores stale responses after a later recheck", async () => {
  const pending = [];
  const f = fixture(() => new Promise((resolve) => pending.push(resolve)));
  f.mount();
  await settle();
  let tree = f.render();
  nodes(tree).find((node) => node.type === "button" && textOf(node) === "Recheck verified packet").props.onClick();
  pending[1](view(["DC"])); await settle(); tree = f.render();
  pending[0](view(["AK"])); await settle(); tree = f.render();
  assert.match(textOf(tree), /District of Columbia/);
  assert.doesNotMatch(textOf(tree), /Alaska/);
});
