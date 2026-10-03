import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvalPacket, calculateFeasibility, publishZctaGdpModelApprovalPacket, readZctaGdpModelApprovalPacket, verifyZctaGdpModelApprovalPacket } from "./zcta-gdp-model-approval-packet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("registered approval packet verifies and reader preserves HOLD", async () => {
  const registration = JSON.parse(await fs.readFile(path.join(ROOT, "config/datasets/zcta-gdp-model-approval-packet.json")));
  const verified = await verifyZctaGdpModelApprovalPacket(registration.retained_release.manifest);
  const packet = await readZctaGdpModelApprovalPacket();
  assert.equal(verified.manifest_sha256, registration.retained_release.manifest_sha256);
  assert.equal(packet.decision_status, "hold");
  assert.equal(packet.claims.model_approved, false);
  assert.equal(packet.claims.output_authorized, false);
  assert.equal(packet.claims.numeric_gdp_emitted, false);
  await assert.rejects(fs.stat(path.join(ROOT, "data/zcta-gdp-model-approval-packet/current.json")), { code: "ENOENT" });
});

test("packet conserves the independently replayed feasibility cohort and defines exact gates", async () => {
  const packet = await readZctaGdpModelApprovalPacket();
  assert.equal(packet.feasibility.total_zctas, 33_791);
  assert.equal(packet.feasibility.technically_feasible_all_methods, 30_576);
  assert.equal(packet.feasibility.withheld, 3_215);
  assert.equal(packet.feasibility.technically_feasible_all_methods + packet.feasibility.withheld, packet.feasibility.total_zctas);
  assert.equal(packet.feasibility.feasible_when_all.length, 4);
  assert.match(packet.feasibility.interpretation, /not approval/);
  assert.equal(packet.proposed_methods.fallback, null);
});

test("eligibility drift changes the recomputed count instead of preserving an asserted total", () => {
  const diagnostic = { county_geoid: "01001", conservation_residual: { area: 0, payroll_hybrid: 0, establishment_fallback: 0 } };
  const relationship = { zcta: "01001", county_geoid: "01001", material_intersection: true, direct_bea_county_input: true, payroll_input_state: "observed", establishment_input_state: "observed", area_proxy_weight: 1, payroll_hybrid_weight: 1, establishment_fallback_weight: 1 };
  assert.deepEqual(calculateFeasibility([relationship], [diagnostic]), { total_zctas: 1, technically_feasible_all_methods: 1, withheld: 0 });
  const tampered = { ...relationship, payroll_hybrid_weight: null };
  assert.deepEqual(calculateFeasibility([tampered], [diagnostic]), { total_zctas: 1, technically_feasible_all_methods: 0, withheld: 1 });
});

test("publisher refuses caller timestamps and verifier rejects traversal", async () => {
  await assert.rejects(publishZctaGdpModelApprovalPacket({ createdAt: "2020-01-01T00:00:00Z" }), /override unsupported/);
  await assert.rejects(verifyZctaGdpModelApprovalPacket("../manifest.json"), /path escape/);
});

test("registered artifact binds exact specification, evaluation and BEA policy hashes", async () => {
  const packet = await readZctaGdpModelApprovalPacket();
  assert.equal(packet.bindings.model_specification.manifest_sha256, "4589ab319abc68b9f01792195c0bfa3330393dab37e3e7658180d94d63ac28de");
  assert.equal(packet.bindings.allocation_evaluation.manifest_sha256, "ed84cd953807d447901edb15bc0c4386587c80ac565b8246a88d062219134b92");
  assert.equal(packet.bindings.allocation_evaluation_artifacts.relationships.sha256, "d3c1a5c92cc4b12d6b2affd65257c8ab16deee91aba89bc3db664295a2474a19");
  assert.equal(packet.bindings.allocation_evaluation_artifacts.county_diagnostics.sha256, "9370a614bedd753e05c26f912d4bec7d2bfe5f827660e7415ed4ebdd24691282");
  assert.equal(packet.bindings.bea_policy.sha256, "12fe76c43702502322abb5530704658dbd2bbb0dd795cf499791b87b931f38da");
});
