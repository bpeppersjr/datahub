import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MN_ACTIVE_HEADERS, MN_ACTIVE_GATES, readMnActiveBusinessDataZeroRow, validateMnActiveBusinessDataZeroRow } from "./mn-active-business-data-zero-row.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async relative => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const authority = () => Object.fromEntries(["source_access", "contact", "account", "payment", "terms_acceptance", "acquisition", "publication", "national_admission", "pointer_change", "production"].map(key => [key, false]));
async function values() {
  return {
    documentation: await json("config/source-documentation/mn-active-business-data-guide-2025-08-01.json"),
    assessment: await json("config/state-business-source-assessments/mn-2026-10-03.json"),
    discovery: await json("config/state-business-source-discovery-queue-8.json"),
    connector: await json("config/connectors/mn-active-business-data-zero-row.json"),
    policy: await json("config/source-policies/mn-active-business-data-zero-row.json"),
    readiness: await json("config/state-business-source-assessments/mn-active-business-data-zero-row-2026-11-13.json"),
    fixture: { product: "Business Data (Active)", header: [...MN_ACTIVE_HEADERS], rows: [], zip_projection: { zip5_field: "Zip Code", zip4_field: "Zip Code Ext", joined: false }, requested_fields: MN_ACTIVE_HEADERS.filter(name => !["Business Party Name Type", "Party Full Name"].includes(name)), authority: authority() },
  };
}

test("MN Active validator proves only the exact synthetic zero-row contract", async () => {
  const input = await values();
  const result = validateMnActiveBusinessDataZeroRow(input);
  assert.equal(result.header.length, 16); assert.equal(result.source_rows_read, 0); assert.equal(result.network_requests, 0); assert.equal(result.actions_performed, 0);
  assert.deepEqual(result.excluded_fields, ["Business Party Name Type", "Party Full Name"]); assert.deepEqual(result.unresolved_gates, MN_ACTIVE_GATES);
  assert.deepEqual(result.composite_identifier_evidence, { fields: ["File Number", "Business Filing Type"], lifecycle_verified: false });
  assert.deepEqual(result.zip_projection, { zip5_field: "Zip Code", zip4_field: "Zip Code Ext", joined: false });
  assert.equal(Object.values(result.authority).every(value => value === false), true); assert.equal(result.broad_layer_gap_resolved, false);
  assert.equal((await readMnActiveBusinessDataZeroRow({ fixture: input.fixture })).status, "zero-row-ready-gap-unresolved");
});

test("MN Active validator fails closed on schema, product, person, ZIP, row and authority widening", async () => {
  for (const mutate of [
    x => x.fixture.header.reverse(), x => x.fixture.header.pop(), x => x.fixture.header.push("Extra"), x => { x.fixture.header[0] = "Master ID"; },
    x => { x.fixture.product = "Business Bulk Data"; }, x => { x.fixture.rows.push({}); }, x => { x.fixture.zip_projection.joined = true; },
    x => { x.fixture.zip_projection.zip5_field = "Zip Code-Zip Code Ext"; }, x => x.fixture.requested_fields.push("Party Full Name"),
    x => { x.fixture.authority.acquisition = true; }, x => { x.connector.allowed_hosts = ["www.sos.mn.gov"]; }, x => { x.connector.execution_limits.source_rows = 1; },
    x => { x.documentation.semantics.full_bulk_master_id_semantics_inherited = true; }, x => { x.documentation.authority.row_bearing_preflight_authorized = true; },
    x => { x.assessment.unresolved_gates = MN_ACTIVE_GATES.slice(1); }, x => { x.policy.person_bearing_fields_admissible = true; },
    x => { x.readiness.documentation.sha256 = "f".repeat(64); }, x => { x.readiness.unresolved_gates.pop(); }, x => { x.readiness.authority.production = true; },
  ]) { const changed = await values(); mutate(changed); assert.throws(() => validateMnActiveBusinessDataZeroRow(changed), /evidence is unavailable/); }
});

test("MN Active governed reader rejects any hash drift", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mn-active-zero-row-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of ["config/source-documentation/mn-active-business-data-guide-2025-08-01.json", "config/state-business-source-assessments/mn-2026-10-03.json", "config/state-business-source-discovery-queue-8.json", "config/connectors/mn-active-business-data-zero-row.json", "config/source-policies/mn-active-business-data-zero-row.json", "config/state-business-source-assessments/mn-active-business-data-zero-row-2026-11-13.json"]) await cp(path.join(ROOT, relative), path.join(root, relative), { recursive: true });
  const target = path.join(root, "config/connectors/mn-active-business-data-zero-row.json");
  await writeFile(target, `${await readFile(target, "utf8")} `);
  await assert.rejects(readMnActiveBusinessDataZeroRow({ root, fixture: (await values()).fixture }), /evidence is unavailable/);
});
