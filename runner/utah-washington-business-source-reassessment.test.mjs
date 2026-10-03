import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadUtahBusinessSourceReassessment, loadWashingtonBusinessSourceReassessment, validateUtahWashingtonBusinessSourceReassessment } from "./utah-washington-business-source-reassessment.mjs";
import { loadStateBusinessSourceAssessmentWave } from "./state-business-source-assessment-wave.mjs";

test("UT corrects paid bulk/schema evidence and WA distinguishes href catalog from data API", async () => {
  const ut = await loadUtahBusinessSourceReassessment(), wa = await loadWashingtonBusinessSourceReassessment();
  assert.equal(ut.fields.published, true);
  assert.match(ut.access.bulk, /subscribers only/);
  assert.match(ut.fields.summary, /does not parse or reproducibly extract/);
  assert.equal(wa.fields.published, false);
  assert.match(wa.access.api, /columns: \[\]/);
  assert.match(wa.automation_terms_fees, /noncommercial-purpose declaration/);
  for (const value of [ut,wa]) { assert.equal(value.decision,"hold"); assert.ok(Object.values(value.authority).every(v=>v===false)); }
  const old = await loadStateBusinessSourceAssessmentWave();
  assert.equal(old.states.find(v=>v.state.abbreviation==="UT").access.classification,"search-only");
});

test("reassessments reject authority escalation, identity substitution, and unsupported evidence", async () => {
  for (const original of [await loadUtahBusinessSourceReassessment(),await loadWashingtonBusinessSourceReassessment()]) {
    for (const mutate of [v=>{v.decision="ready";},v=>{v.connector_candidate=true;},v=>{v.controls.downloads=1;},v=>{v.controls.contacts_made=1;},v=>{v.authority.pointer_changes=true;},v=>{v.authority.network_execution=true;},v=>{v.authority.payment=true;},v=>{v.fields.published=!v.fields.published;},v=>{v.supersedes_assessment_id="other";},v=>{v.citations[0].url="https://example.com/";},v=>{v.access.classification="public-api";}]) {
      const value=structuredClone(original); mutate(value); assert.throws(()=>validateUtahWashingtonBusinessSourceReassessment(value));
    }
  }
});

test("source-specific operational docs match managed package routes and retained WA release", async () => {
  const root=APP_ROOT;
  const [ut,ok,wa,server,ui]=await Promise.all(["docs/UTAH-BUSINESS-LIST-OFFLINE.md","docs/OK-BUSINESS-BULK-OFFLINE.md","docs/WA-LNI-ACTIVE-CONTRACTOR-LICENSES.md","runner/server.mjs","app/data-operations.tsx"].map(file=>readFile(path.join(root,file),"utf8")));
  for (const [doc,route] of [[ut,"ut-business-list"],[ok,"ok-business-bulk"]]) { assert.match(doc,/managed server and Data Operations UI/); assert.ok(server.includes(`endpoint === '${route}'`)); assert.ok(ui.includes(`'/${route}'`)); assert.doesNotMatch(doc,/not yet enrolled|does not connect to the managed server/); }
  assert.ok(wa.includes("wa-lni-active-contractor-licenses-20260907-135045275Z-4c8b3283"));
});
