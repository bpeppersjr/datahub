import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/broad-organization-current-authorization-chain.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const rosters = [
  ["IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT", "WA", "OK"],
  ["AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"],
  ["MI", "MN", "MO", "MT", "NC", "ND", "NH", "NJ", "NM", "OH"],
  ["RI", "SC", "SD", "TN", "VA", "VT", "WI", "WV", "WY", "NE"],
];
function fixture(runnerJson) {
  const slots = [], refs = [], effects = [], calls = []; let index = 0; const exports = {};
  runInNewContext(code, {
    exports, AbortController, window: globalThis,
    require: (name) => name === "./runner-client" ? { runnerJson: (...args) => { calls.push(args); return runnerJson(...args); } }
      : name === "react" ? {
        useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }]; },
        useRef(initial) { const slot = index++; if (!(slot in refs)) refs[slot] = { current: initial }; return refs[slot]; },
        useCallback(callback) { index += 1; return callback; }, useEffect(effect) { index += 1; effects.push(effect); },
      }
        : name === "react/jsx-runtime" ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" }
          : { __esModule: true, default: () => null },
  });
  return { calls, mount() { const tree = this.render(); for (const effect of effects.splice(0)) effect(); return tree; }, render() { index = 0; return exports.default(); } };
}
const state = (code, wave, position) => ({ state_abbreviation: code, state_name: `${code} name`, wave, wave_position: position, historical_backlog_priority: wave * 10 + position, matrix_gap_status: "unmeasured", approval_status: "HOLD", item_kind: "approval-only", acquisition_authorized: false, required_exclusions: ["Person-linked fields excluded"], unresolved_gates: [{ gate_key: "schema-review", status: "HOLD", item_kind: "approval-only", acquisition_authorized: false }] });
const view = () => ({ schema_version: "broad-organization-current-authorization-chain-management-view@1.0.0", available: true,
  metadata: { matrix_release_id: "matrix-current", matrix_manifest_sha256: "a".repeat(64), gap_projection_release_id: "projection-current", gap_projection_manifest_sha256: "b".repeat(64), gap_projection_artifact_sha256: "c".repeat(64), jurisdiction_count: 51, broad_data_coverage: { admitted_jurisdictions: 11, denominator: 51, current_data_gaps: 40, meaning: "retained evidence; not completeness" }, authorization_packet_coverage: { expected_current_gaps: 40, packeted_current_gaps: 40, authorization_packet_gaps: 0 }, wave_count: 4, current_gap_state_count: 40, gate_item_count: 40 },
  authority: { approval_only: true, status: "HOLD", approval_granted: false, acquisition_authorized: false, contact_authorized: false, download_authorized: false, payment_authorized: false, record_request_authorized: false, network_requests: 0, source_actions_performed: 0, current_pointer_changed: false, production_change_authorized: false },
  waves: rosters.map((codes, index) => ({ wave_number: index + 1, release_id: `wave-${index + 1}`, manifest_sha256: "d".repeat(64), artifact_sha256: "e".repeat(64), selected_count: 10, remaining_count: 30 - index * 10, cumulative_prior_count: index * 10, gate_item_count: 10, state_abbreviations: codes, prior_wave: index ? { release_id: `wave-${index}`, manifest_sha256: "d".repeat(64), artifact_sha256: "e".repeat(64), wave_state_abbreviations: rosters[index - 1] } : null })),
  states: rosters.flatMap((codes, index) => codes.map((code, position) => state(code, index + 1, position + 1))),
});
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const textOf = (tree) => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(textOf).join(" ") : tree && typeof tree === "object" ? textOf(tree.props?.children) : "";
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("panel displays data coverage separately from packet coverage and filters 40 HOLD states", async () => {
  const f = fixture(async (url, options) => { assert.equal(url, "/api/data-operations/broad-organization-current-authorization-chain"); assert.ok(options.signal); return view(); });
  f.mount(); await settle(); let tree = f.render();
  assert.match(textOf(tree), /11\/51 jurisdictions have admitted broad-layer evidence/);
  assert.match(textOf(tree), /40 data gaps remain/);
  assert.match(textOf(tree), /0 authorization-packet gaps/);
  assert.match(textOf(tree), /No approval, acquisition, contact, download, payment, record request, network request, pointer change, or production action is authorized/);
  assert.equal(nodes(tree).filter((node) => node.type === "article" && node.props.className === "operation-record").length, 40);
  let selects = nodes(tree).filter((node) => node.type === "select");
  assert.deepEqual(nodes(selects[0]).filter((node) => node.type === "option").map((item) => item.props.value), ["", "1", "2", "3", "4"]);
  selects[0].props.onChange({ target: { value: "3" } }); tree = f.render();
  assert.equal(nodes(tree).filter((node) => node.type === "article" && node.props.className === "operation-record").length, 10);
  assert.match(textOf(tree), /MI name/);
  assert.match(textOf(tree), /schema review\s+·\s+approval-only\s+·\s+HOLD\s+·\s+acquisition authorized: no/);
  selects = nodes(tree).filter((node) => node.type === "select");
  selects[1].props.onChange({ target: { value: "NJ" } }); tree = f.render();
  assert.equal(nodes(tree).filter((node) => node.type === "article" && node.props.className === "operation-record").length, 1);
  assert.match(textOf(tree), /NJ name/);
  assert.deepEqual(nodes(tree).filter((node) => node.type === "button").map((node) => textOf(node)), ["Recheck verified chain"]);
});

test("panel cancels stale requests and clears details when recheck fails", async () => {
  const pending = [];
  const f = fixture((_url, options) => new Promise((resolve, reject) => pending.push({ resolve, reject, signal: options.signal })));
  f.mount(); await settle(); let tree = f.render();
  nodes(tree).find((node) => node.type === "button").props.onClick();
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(view()); await settle();
  pending[0].resolve({ ...view(), states: [] }); await settle();
  tree = f.render(); assert.match(textOf(tree), /IL name/);
  nodes(tree).find((node) => node.type === "button").props.onClick();
  pending[2].reject(new Error("private release path")); await settle();
  tree = f.render();
  assert.match(textOf(tree), /unavailable or failed verification/);
  assert.doesNotMatch(textOf(tree), /IL name|matrix-current|wave-1/);
});

test("Data Operations adds the new panel without replacing the historical program panel", async () => {
  const source = await readFile(new URL("../app/data-operations.tsx", import.meta.url), "utf8");
  assert.match(source, /import BroadOrganizationAuthorizationProgram from '.\/broad-organization-authorization-program'/);
  assert.match(source, /import BroadOrganizationCurrentAuthorizationChain from '.\/broad-organization-current-authorization-chain'/);
  assert.match(source, /<BroadOrganizationAuthorizationProgram \/>/);
  assert.match(source, /<BroadOrganizationCurrentAuthorizationChain \/>/);
});
