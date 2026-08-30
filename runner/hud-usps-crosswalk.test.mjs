import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildHudZipEvidence,
  fetchHudUsps,
  normalizeHudUspsConfig,
  normalizeHudUspsResponse,
} from "./hud-usps-crosswalk.mjs";

const fixture = JSON.parse(await readFile(
  new URL("./fixtures/hud-usps-zip-county-q1-2026.json", import.meta.url),
  "utf8",
));

test("validates explicit HUD year and quarter", () => {
  assert.deepEqual(normalizeHudUspsConfig({ year: 2026, quarter: 1 }), { year: 2026, quarter: 1 });
  assert.throws(() => normalizeHudUspsConfig({ year: 2026, quarter: 5 }), /quarter/);
});

test("normalizes HUD ZIP-county response with ratios and leading zeros", () => {
  const rows = normalizeHudUspsResponse(fixture, { year: 2026, quarter: 1 });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].zip_code, "01001");
  assert.equal(rows[0].county_fips, "25013");
  assert.equal(rows[0].business_ratio, 0.995);
});

test("builds incomplete-source ZIP validity evidence without discarding county splits", () => {
  const rows = normalizeHudUspsResponse(fixture, { year: 2026, quarter: 1 });
  const evidence = buildHudZipEvidence(rows, {
    runId: "fixture-run",
    retrievedAt: "2026-08-30T00:00:00.000Z",
  });
  assert.equal(evidence.zipEvidence.length, 2);
  assert.equal(evidence.crosswalk.length, 3);
  assert.equal(evidence.zipEvidence[0].county_count, 2);
  assert.equal(evidence.zipEvidence[0].primary_county_fips, "25013");
  assert.equal(evidence.zipEvidence[0].authoritative_master_status, "incomplete-source");
});

test("requires the named HUD secret before any request", async () => {
  let requested = false;
  await assert.rejects(
    fetchHudUsps({ year: 2026, quarter: 1 }, "", {
      fetchImpl: async () => {
        requested = true;
        return new Response(JSON.stringify(fixture));
      },
    }),
    /HUD_USPS_API_TOKEN is required/,
  );
  assert.equal(requested, false);
});

test("sends the HUD token only in the Authorization header", async () => {
  const requests = [];
  const token = "redaction-canary-not-a-credential";
  const response = await fetchHudUsps({ year: 2026, quarter: 1 }, token, {
    retries: 0,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].options.headers.authorization, /^Bearer redaction-canary-not-a-credential$/);
  assert.doesNotMatch(requests[0].url, /redaction-canary-not-a-credential/);
  assert.doesNotMatch(response.requestUrl, /redaction-canary-not-a-credential/);
  assert.match(requests[0].url, /type=2/);
  assert.match(requests[0].url, /query=All/);
  assert.match(requests[0].url, /year=2026/);
  assert.match(requests[0].url, /quarter=1/);
});
