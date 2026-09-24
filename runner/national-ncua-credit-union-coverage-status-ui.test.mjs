import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
    new URL(
      "../app/national-ncua-credit-union-coverage-status.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
function fixture(runnerJson) {
  const slots = [],
    effects = [],
    cleanups = [];
  let index = 0;
  const exports = {};
  runInNewContext(code, {
    exports,
    AbortController,
    require: (name) =>
      name === "./runner-client"
        ? { runnerJson }
        : name === "react"
          ? {
              useState(initial) {
                const i = index++;
                if (!(i in slots)) slots[i] = initial;
                return [
                  slots[i],
                  (next) => {
                    slots[i] =
                      typeof next === "function" ? next(slots[i]) : next;
                  },
                ];
              },
              useEffect(effect) {
                index++;
                effects.push(effect);
              },
            }
          : name === "react/jsx-runtime"
            ? {
                jsx: (type, props) => ({ type, props }),
                jsxs: (type, props) => ({ type, props }),
                Fragment: "fragment",
              }
            : {},
  });
  return {
    mount() {
      this.render();
      for (const effect of effects.splice(0)) cleanups.push(effect());
    },
    unmount() {
      for (const cleanup of cleanups.splice(0)) cleanup?.();
    },
    render() {
      index = 0;
      return exports.default();
    },
  };
}
const nodes = (tree) =>
    !tree || typeof tree !== "object"
      ? []
      : Array.isArray(tree)
        ? tree.flatMap(nodes)
        : [tree, ...nodes(tree.props?.children)],
  textOf = (tree) =>
    typeof tree === "string"
      ? tree
      : Array.isArray(tree)
        ? tree.map(textOf).join(" ")
        : tree && typeof tree === "object"
          ? textOf(tree.props?.children)
          : "",
  settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const view = () => ({
  available: true,
  release: { release_id: "ncua-r1" },
  product_label:
    "NCUA quarterly federally insured credit unions and scoped locations",
  source: {
    cycle_date: "2026-03-31",
    retrieved_at: "2026-09-03T00:44:26.083Z",
  },
  coverage: {
    source_institutions: 4336,
    federally_insured_institutions: 4250,
    excluded_non_federally_insured_institutions: 86,
    source_branch_records: 22829,
    accepted_scoped_us_locations: 22445,
    excluded_non_federally_insured_locations: 332,
    excluded_locations_outside_us: 49,
    quarantined_records: 5,
    positive_zip5_rows: 9401,
    zip5_union_rows: 37855,
    denominator_only_zip5_rows: 28454,
    represented_institutions_with_locations: 4245,
    institutions_without_accepted_us_location: 5,
    corporate_office_site_type_count: 5287,
    branch_office_site_type_count: 17158,
    source_main_office_flag_count: 4242,
    reported_zip4_count: 9571,
    retained_coordinate_count: 0,
    missing_coordinate_count: 22445,
    record_zcta_count: 22295,
    record_nonpolygon_count: 150,
    positive_source_zip_outside_zbp_zcta: 27,
  },
  claims: {},
  inclusion: {
    generic_business_totals: false,
    generic_entity_totals: false,
    generic_site_totals: false,
    generic_category_totals: false,
    generic_exports: false,
    production_enrollment: false,
    status: "excluded-non-additive-governed-layer",
  },
});
test("NCUA panel renders distinct institution/location dimensions and no controls", async () => {
  const f = fixture(async (url, options) => {
    assert.equal(
      url,
      "/api/data-operations/national-ncua-credit-union-coverage-status",
    );
    assert.ok(options.signal);
    return view();
  });
  f.mount();
  await settle();
  const tree = f.render(),
    text = textOf(tree);
  for (const expected of [
    "4,250",
    "22,445",
    "4,245",
    "5",
    "5,287",
    "4,242",
    "17,158",
    "9,401",
    "28,454",
    "9,571",
    "2026-03-31",
    "2026-09-03T00:44:26.083Z",
    "nonexclusive",
    "not all credit unions",
  ])
    assert.match(text, new RegExp(expected, "i"));
  assert.equal(
    nodes(tree).filter((node) =>
      ["button", "input", "select"].includes(node.type),
    ).length,
    0,
  );
});
test("NCUA panel rejects stale completion and clears cached evidence on failure", async () => {
  let resolve, signal;
  const stale = fixture(
    (_url, options) =>
      new Promise((done) => {
        resolve = () => done(view());
        signal = options.signal;
      }),
  );
  stale.mount();
  stale.unmount();
  assert.equal(signal.aborted, true);
  resolve();
  await settle();
  assert.doesNotMatch(textOf(stale.render()), /22,445|ncua-r1/);
  let reject;
  const failed = fixture(
    () =>
      new Promise((_done, no) => {
        reject = no;
      }),
  );
  failed.mount();
  reject(new Error("fail"));
  await settle();
  assert.match(textOf(failed.render()), /No cached evidence/);
});
test("Data Operations includes separate NCUA status", async () => {
  const data = await readFile(
    new URL("../app/data-operations.tsx", import.meta.url),
    "utf8",
  );
  assert.match(data, /import NationalNcuaCreditUnionCoverageStatus/);
  assert.match(data, /<NationalNcuaCreditUnionCoverageStatus \/>/);
});
test("exact ZIP Business Intelligence renders separate NCUA location evidence", async () => {
  const data = await readFile(
    new URL("../app/business-intelligence.tsx", import.meta.url),
    "utf8",
  );
  for (const expected of [
    /ncua_credit_union_location_evidence/,
    /NCUA quarterly federally insured credit-union evidence/,
    /Scoped location rows/,
    /Source main-office flags/,
    /Source-reported nonexclusive service evidence/,
    /cycle_date/,
    /retrieved_at/,
    /not all credit unions, unique businesses/,
  ])
    assert.match(data, expected);
});
