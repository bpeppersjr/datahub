import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyNationalBusinessCoRegistrationStatusPosture as verify } from "./national-business-co-registration-status-posture.mjs";

test("Colorado posture preserves separate registration statuses and four exact conservations", async () => {
  const value = await verify(), c = value.conservation;
  assert.equal(c.published_organizations + c.quarantined_rows, c.source_rows);
  assert.equal(c.good_standing + c.delinquent, c.published_organizations);
  assert.equal(c.eligible_us_address + c.without_eligible_us_zip, c.published_organizations);
  assert.equal(value.posture.good_standing.organization_count + value.posture.delinquent.organization_count, c.published_organizations);
  assert.deepEqual(value.claims, { current_operations_verified: false, active_business_eligible: false, active_business_count: null, completeness_percentage: null, location_profile_cohort_affected: false, network_requests: 0, production_enrollment: false });
});

test("Colorado posture is abortable and fails closed on a pinned-byte change", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(verify({ signal: controller.signal }), /abort/i);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "co-posture-"));
  await fs.cp(new URL("../config", import.meta.url), path.join(root, "config"), { recursive: true });
  await fs.cp(new URL("../data/business-sources/co-business-registry-good-standing-or-delinquent-organizations", import.meta.url), path.join(root, "data/business-sources/co-business-registry-good-standing-or-delinquent-organizations"), { recursive: true });
  await fs.appendFile(path.join(root, "config/source-policies/co-business-registry.json"), " ");
  await assert.rejects(verify({ root }), /source_policy pin/);
  await fs.rm(root, { recursive: true, force: true });
});

test("Colorado posture rejects the prior taxonomy and a rehashed source count substitution", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "co-posture-selection-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registrationPath = "config/datasets/national-business-co-registration-status-posture.json";
  const registration = JSON.parse(await fs.readFile(new URL(`../${registrationPath}`, import.meta.url), "utf8"));
  const binding = registration.bindings.lifecycle_taxonomy;
  const taxonomy = JSON.parse(await fs.readFile(new URL(`../${binding.path}`, import.meta.url), "utf8"));
  taxonomy.expected_profile_counts["new-york-agriculture-markets-retail-food-stores"] = 24230;
  const substituted = JSON.stringify(taxonomy);
  await fs.mkdir(path.dirname(path.join(root, registrationPath)), { recursive: true });
  await fs.writeFile(path.join(root, binding.path), substituted);
  for (const digest of [
    "7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc",
    createHash("sha256").update(substituted).digest("hex"),
  ]) {
    binding.sha256 = digest;
    await fs.writeFile(path.join(root, registrationPath), JSON.stringify(registration));
    await assert.rejects(verify({ root }), /selected lifecycle_taxonomy binding/);
  }
});
