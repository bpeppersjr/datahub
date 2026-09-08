import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { preflightOhChildcare } from "./oh-childcare-preflight.mjs";
import { ohioFixture } from "./fixtures/oh-childcare.mjs";
import notices from "./fixtures/oh-childcare-publisher-notices.json" with { type: "json" };
import decision from "../docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json" with { type: "json" };
import oldPolicy from "../config/source-policies/oh-childcare-local-review.json" with { type: "json" };
import { bindOhChildcareSourceUse } from "./oh-childcare-source-use.mjs";
import { acquireOhChildcare } from "./oh-childcare-transport.mjs";
const checkedAt = "2026-09-08T06:55:00.000Z";
async function preflight(realNotices = true) {
  const f = ohioFixture((v, k) => { if (k === "item" && realNotices) Object.assign(v, notices); });
  return preflightOhChildcare({ ...f.options, now: () => new Date("2026-09-08T06:54:00.000Z") });
}
test("Ohio current supplied notices bind scoped use without changing development policy or enabling live dispatch", async () => {
  const p = await preflight(), availability = structuredClone(decision.availability_observations), original = structuredClone(availability);
  const binding = bindOhChildcareSourceUse(p, availability, { checkedAt });
  assert.equal(binding.source_use_authorized, true); assert.equal(binding.dispatch_authorized, false); assert.equal(binding.app_job_enrolled, false);
  for (const key of ["legal_approval", "export_authorized", "agreement_acceptance_performed", "source_authenticity_verified"]) assert.equal(binding[key], false);
  assert.equal(binding.preflight_sha256, createHash("sha256").update(JSON.stringify(p)).digest("hex"));
  binding.availability_observations[0].http_status = 200; assert.deepEqual(availability, original);
  assert.equal(oldPolicy.acquisition_authorized, false); assert.equal(oldPolicy.connector_ready, false);
  await assert.rejects(acquireOhChildcare(), { code: "OH_CHILDCARE_LIVE_NOT_ENROLLED" });
});
test("Ohio synthetic, changed or omitted notice strings cannot substitute for reviewed current notices", async () => {
  assert.throws(() => bindOhChildcareSourceUse(null, [], { checkedAt }), /Ohio/);
  const synthetic = await preflight(false); assert.throws(() => bindOhChildcareSourceUse(synthetic, decision.availability_observations, { checkedAt }), /notices changed/);
  const changed = await preflight();
  for (const o of changed.observations.filter((o) => o.kind === "item")) { o.payload.licenseInfo += " changed"; o.payload_sha256 = createHash("sha256").update(JSON.stringify(o.payload)).digest("hex"); }
  assert.throws(() => bindOhChildcareSourceUse(changed, decision.availability_observations, { checkedAt }), /notices changed/);
});
test("Ohio newly available, changed, omitted, reordered and private availability evidence requires review", async () => {
  const p = await preflight();
  for (const change of [(a) => { a[0].http_status = 200; }, (a) => { a[0].sha256 = "0".repeat(64); }, (a) => { a[0].bytes++; }, (a) => { a.pop(); }, (a) => { a.reverse(); }, (a) => { a[0].body = "PRIVATE"; }, (a) => { a[0] = null; }]) {
    const a = structuredClone(decision.availability_observations); change(a); assert.throws(() => bindOhChildcareSourceUse(p, a, { checkedAt }), (e) => /Ohio/.test(e.message) && !e.message.includes("PRIVATE"));
  }
});
test("Ohio stale or future prerequisites and caller-supplied approval options cannot satisfy current-use binding", async () => {
  const p = await preflight();
  for (const options of [{}, { checkedAt: "2026-09-08" }, { checkedAt: "2026-09-08T06:50:00.000Z" }, { checkedAt: "2026-09-08T07:15:00.000Z" }, { checkedAt, approved: true }]) assert.throws(() => bindOhChildcareSourceUse(p, decision.availability_observations, options), /Ohio/);
  const a = structuredClone(decision.availability_observations); a[3].observed_at = "2026-09-08T06:56:00.000Z";
  assert.throws(() => bindOhChildcareSourceUse(p, a, { checkedAt }), /availability/);
  a[3].observed_at = "2026-09-07T06:00:00.000Z"; assert.throws(() => bindOhChildcareSourceUse(p, a, { checkedAt }), /availability/);
});
