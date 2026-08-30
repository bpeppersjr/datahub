import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  acquireUspsOperationalZipFiles,
  buildUspsOperationalZipAssignments,
  discoverUspsFileUrl,
  normalizeUspsUseAuthorization,
  parseAisuLayout,
  parseAisuZipFile,
  parseAreaDistrictZipFile,
  reconcileUspsZipSets,
  verifyUspsOperationalZipRelease,
} from "./usps-operational-zip-assignments.mjs";

function areaLine(area, code, district, zip, districtCode = zip.slice(0, 3)) {
  return `${area.padEnd(21)}${code} ${district.padEnd(21)}${districtCode.padEnd(3)} ${zip}`;
}

const areaFile = `${areaLine("ATLANTIC", "4B", "NEW YORK 2", "00501", "117")}\r\n${areaLine("SOUTHERN", "4G", "PUERTO RICO", "00601")}\r\n`;
const aisuFile = "0030370030\r\n0050170010\r\n0060170011\r\n";
const layoutFile = "FILE LAYOUT FOR AISUZIPS.TXT\r\n\r\n FIELD DESCRIPTION LOGICAL LENGTH FROM/THRU\r\n 1  5 DIGIT ZIP  05  01 05\r\n 2  AISU         05  06 10\r\n 3  CRLF         02  11 12\r\n";

function mockFetch(url) {
  const value = String(url);
  const month = "2026-08";
  const pageFiles = {
    "https://postalpro.usps.com/areadist_ZIP5": `/${`storages/${month}/AREADIST_ZIP5_2.TXT`}`,
    "https://postalpro.usps.com/ais-viewer/aisuzips": `/${`storages/${month}/AISUZIPS_2.TXT`}`,
    "https://postalpro.usps.com/ais-viewer/aisulout": `/${`storages/${month}/AISULOUT_2.TXT`}`,
  };
  if (pageFiles[value]) return Promise.resolve(new Response(`<a href="${pageFiles[value]}">download</a>`));
  if (value.endsWith("/AREADIST_ZIP5_2.TXT")) return Promise.resolve(new Response(areaFile));
  if (value.endsWith("/AISUZIPS_2.TXT")) return Promise.resolve(new Response(aisuFile));
  if (value.endsWith("/AISULOUT_2.TXT")) return Promise.resolve(new Response(layoutFile));
  return Promise.resolve(new Response("not found", { status: 404 }));
}

test("requires an explicit USPS use basis before acquisition", () => {
  assert.throws(() => normalizeUspsUseAuthorization({}), /use authorization basis/);
  assert.deepEqual(normalizeUspsUseAuthorization({ basis: "personal-noncommercial-home-use" }), {
    basis: "personal-noncommercial-home-use",
    permission_reference: null,
    redistribution_authorized: false,
  });
  assert.throws(() => normalizeUspsUseAuthorization({ basis: "usps-written-permission" }), /permission reference/);
  assert.equal(normalizeUspsUseAuthorization({ basis: "usps-written-permission", permissionReference: "USPS-LETTER-2026-001" }).redistribution_authorized, true);
});

test("discovers one exact versioned PostalPro resource and rejects another host", () => {
  const url = discoverUspsFileUrl(
    '<a href="/storages/2026-08/AREADIST_ZIP5_2.TXT">file</a>',
    "https://postalpro.usps.com/areadist_ZIP5",
    /^AREADIST_ZIP5(?:_\d+)?\.TXT$/i,
  );
  assert.equal(url, "https://postalpro.usps.com/storages/2026-08/AREADIST_ZIP5_2.TXT");
  assert.throws(() => discoverUspsFileUrl(
    '<a href="https://example.com/AREADIST_ZIP5_2.TXT">file</a>',
    "https://postalpro.usps.com/areadist_ZIP5",
    /^AREADIST_ZIP5(?:_\d+)?\.TXT$/i,
  ), /must use HTTPS/);
});

test("parses both fixed-width files and excludes AISU-only routing rows", () => {
  assert.equal(parseAisuLayout(layoutFile).record_length, 10);
  const aisu = parseAisuZipFile(aisuFile);
  const area = parseAreaDistrictZipFile(areaFile);
  const result = reconcileUspsZipSets(area, aisu);
  assert.equal(area[0].zip_code, "00501");
  assert.equal(area[0].district_name, "NEW YORK 2");
  assert.equal(area[0].district_code, "117");
  assert.equal(result.area_district_assignments, 2);
  assert.equal(result.routing_only_rows, 1);
  assert.deepEqual(result.routing_only_zip_codes, ["00303"]);
  const headquarters = parseAreaDistrictZipFile(`${areaLine("HEADQUARTERS", "4N", "HEADQUARTERS", "56901", "HQ")}\r\n`);
  assert.equal(headquarters[0].district_code, "HQ");
});

test("fails when an Area/District assignment is absent from AISUZIPS", () => {
  const area = parseAreaDistrictZipFile(areaFile);
  assert.throws(() => reconcileUspsZipSets(area, parseAisuZipFile("0050170010\r\n")), /absent from AISUZIPS/);
});

test("requires all acquired USPS resources to share one storage month", async () => {
  await assert.rejects(acquireUspsOperationalZipFiles({
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("/aisulout")) return new Response('<a href="/storages/2026-07/AISULOUT_2.TXT">file</a>');
      return mockFetch(url);
    },
  }), /share one storage release month/);
});

test("publishes and independently verifies a local-restricted release", async (t) => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "usps-operational-zips-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const result = await buildUspsOperationalZipAssignments({
    outputRoot,
    useAuthorization: { basis: "personal-noncommercial-home-use" },
    fetchImpl: mockFetch,
    qualityMinimumAssignments: 2,
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.current_area_district_zip_assignment_denominator, 2);
  assert.equal(result.manifest.coverage.routing_only_rows_excluded_from_denominator, 1);
  assert.equal(result.manifest.complete_current_delivery_zip_registry, false);
  const verified = await verifyUspsOperationalZipRelease(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.aisu_routing_rows, 3);
  const rows = (await readFile(path.join(result.releaseDirectory, "derived/operational-zip-assignments.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(rows[0].export_policy, "local-restricted");
  assert.equal(rows[0].deliverability_status, "not-asserted");

  const manifestPath = path.join(result.releaseDirectory, "manifest.json");
  const originalManifest = await readFile(manifestPath, "utf8");
  const inconsistentManifest = JSON.parse(originalManifest);
  inconsistentManifest.use_authorization.redistribution_authorized = true;
  await writeFile(manifestPath, `${JSON.stringify(inconsistentManifest)}\n`);
  await assert.rejects(verifyUspsOperationalZipRelease(manifestPath), /verification failed/);
  await writeFile(manifestPath, originalManifest);

  await writeFile(path.join(result.releaseDirectory, "derived/operational-zip-assignments.jsonl"), "{}\n");
  await assert.rejects(verifyUspsOperationalZipRelease(manifestPath), /verification failed/);
});
