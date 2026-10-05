import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const admin = await readFile(new URL("../app/administration.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");

test("administration persists maintenance intent without authorization claims", () => {
  assert.match(admin, /\/api\/administration\/industries/);
  assert.match(admin, /Select all/);
  assert.match(admin, /Select none/);
  assert.match(admin, /Save maintenance selection/);
  assert.match(admin, /does not authorize acquisition, start downloads, prove coverage, or change production enrollment/);
  assert.match(admin, /expectedRevision/);
  assert.match(admin, /If-Match/);
  assert.match(server, /bodyJson\(request, 16 \* 1024\)/);
  assert.match(server, /statusCode: 428/);
  assert.match(server, /industryMaintenance\.update/);
  assert.match(admin, /Next maintenance review batch/);
  assert.match(admin, /Download review batch JSON/);
  assert.match(admin, /backlog_sha256/);
  assert.match(admin, /sources:/);
  assert.match(admin, /planning evidence only/);
  assert.match(admin, /does not authorize acquisition, dispatch workers, change production, or measure business completeness/);
  assert.match(server, /\/api\/administration\/industry-backlog/);
  assert.match(server, /stateAccessMaintenanceBacklog/);
  assert.doesNotMatch(server, /updateSettings\(\{ maintainedIndustries/);
});

test("geography and industry status preserve evidence boundaries", () => {
  assert.match(workspace, /Census ZCTA map status remains usable independently of USPS ZIP polygons/);
  assert.match(workspace, /Reported ZIP5 without same-code ZCTA \/ non-ZCTA ZIP evidence/);
  assert.match(workspace, /no governed retained overlay classifies this ZIP as park, Native, private/);
  assert.match(workspace, /Industry status reports evidence actually retained/);
  assert.match(workspace, /Missing and unmeasured evidence remains unknown rather than zero/);
});
