import test from "node:test";
import assert from "node:assert/strict";
import { MN_CONSTRUCTION_COLUMNS, inspectMnConstructionHeader, preflightMnConstructionCodes, validateMnConstructionPreflight } from "./mn-construction-preflight.mjs";
import { profileMnConstructionCodes, validateMnConstructionCodeProfile } from "./mn-construction-code-profile.mjs";
const header = MN_CONSTRUCTION_COLUMNS.join(",") + "\r\n";
function row({ marker = "Business", id = "BC123456", status = "Issued", name = 'PRIVATE NAME,"QUOTED"\nPRIVATE SECOND LINE' } = {}) {
  const cells = Array(18).fill("PRIVATE"); cells[0] = marker; cells[3] = name; cells[12] = id; cells[13] = status;
  return cells.map((s) => `"${s.replaceAll('"', '""')}"`).join(",") + "\r\n";
}
const profile = (text) => { const b = Buffer.from(header + text); return profileMnConstructionCodes(b, inspectMnConstructionHeader(b)); };
test("MN code profile counts known buckets without retaining personal fields or full identifiers", () => {
  const p = profile(row() + row({ marker: "Person", id: "QB654321", status: "Expired" }));
  assert.equal(p.complete_records_examined, 2); assert.equal(p.business_person.Business, 1); assert.equal(p.business_person.Person, 1);
  assert.equal(p.credential_prefix.BC, 1); assert.equal(p.credential_prefix.QB, 1); assert.equal(p.status.Issued, 1); assert.equal(p.status.Expired, 1);
  assert.equal(p.incomplete_tail_discarded, false); assert.equal(p.counts_independently_replayed, false);
  assert.ok(!/PRIVATE|123456|654321/.test(JSON.stringify(p))); validateMnConstructionCodeProfile(p);
});
test("MN unknown values are counted without strings/hashes and blank differs from unknown", () => {
  const p = profile(row({ marker: "PRIVATE CODE", id: "PRIVATE ID", status: "PRIVATE STATUS" }) + row({ marker: "", id: "", status: "" }));
  for (const k of ["business_person", "credential_prefix", "status"]) { assert.equal(p[k].unknown, 1); assert.equal(p[k].blank, 1); }
  assert.ok(!JSON.stringify(p).includes("PRIVATE"));
});
test("MN ignores incomplete last records and handles quoted newlines/escaped quotes without column shifts", () => {
  const p = profile(row() + '"Person","x","y","PRIVATE unfinished\nname');
  assert.equal(p.complete_records_examined, 1); assert.equal(p.business_person.Person, 0); assert.equal(p.incomplete_tail_discarded, true);
  const b = Buffer.concat([Buffer.from(header + row() + 'Business,x,y,"'), Buffer.from([0xc3])]);
  assert.equal(profileMnConstructionCodes(b, inspectMnConstructionHeader(b)).complete_records_examined, 1);
  assert.equal(profile("").complete_records_examined, 0);
  for (const tail of ['"' + "x".repeat(101), '"é', "é," + "x,".repeat(12)]) {
    const partial = profile(row() + tail);
    assert.equal(partial.complete_records_examined, 1);
    assert.equal(partial.incomplete_tail_discarded, true);
  }
});
test("MN malformed complete rows and selected codes fail with fixed redacted diagnostics", () => {
  for (const text of ['Business,BC123456,Issued\n', row().replace('"Business",', '"Business"x,'), row({ marker: "x".repeat(101) }), row({ marker: "é" })]) assert.throws(() => profile(text), (e) => !e.message.includes("PRIVATE"));
  assert.throws(() => profileMnConstructionCodes(Buffer.alloc(4097), { header_bytes: 1, columns: MN_CONSTRUCTION_COLUMNS }));
});
test("MN code profile validator enforces exact buckets, conservation and no evidence overclaims", () => {
  const original = profile(row());
  for (const change of [(p) => p.business_person.Business++, (p) => { p.business_person.secret = "PRIVATE"; }, (p) => { p.counts_independently_replayed = true; }, (p) => { p.complete_records_examined = -1; }, (p) => { p.status.Issued = 0.5; }]) {
    const p = structuredClone(original); change(p); assert.throws(() => validateMnConstructionCodeProfile(p));
  }
});
test("MN code preflight uses the same bounded native itinerary and preserves version1 receipt boundaries", async () => {
  const b = Buffer.alloc(4096, 120), text = header + row(); b.write(text + 'Business,x,y,"');
  const hs = { "content-length": "10000", "content-type": "application/octet-stream", etag: '"v1"', "last-modified": "Tue, 08 Sep 2026 09:32:00 GMT" };
  let calls = 0;
  const r = await preflightMnConstructionCodes({ sleep: async () => {}, now: () => new Date("2026-09-08T12:00:00.000Z"), fetchImpl: async (url, opts) => {
    calls++; assert.equal(opts.redirect, "error"); return opts.method === "HEAD" ? new Response(null, { headers: hs }) : new Response(b, { status: 206, headers: { ...hs, "content-length": "4096", "content-range": "bytes 0-4095/10000" } });
  } });
  assert.equal(calls, 6); assert.equal(r.schema_version, 2); assert.equal(r.claims.acquisition_authorized, false);
  assert.equal(r.observations[0].code_profile.complete_records_examined, 1); assert.ok(!JSON.stringify(r).includes("PRIVATE")); validateMnConstructionPreflight(r);
  const forged = structuredClone(r); forged.schema_version = 1; assert.throws(() => validateMnConstructionPreflight(forged));
});
