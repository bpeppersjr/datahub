import assert from "node:assert/strict";
import test from "node:test";
import {
  buildZipCoverage,
  discoverLatestZbp,
  normalizeZbpDetail,
  normalizeZbpTotal,
} from "./census-zbp.mjs";

test("normalizes ZBP totals while preserving suppression flags", () => {
  const record = normalizeZbpTotal({
    zip: "00501",
    name: "HOLTSVILLE, NY",
    emp_nf: "G",
    emp: "0",
    qp1_nf: "G",
    qp1: "0",
    ap_nf: "J",
    ap: "526",
    est: "5",
    city: "HOLTSVILLE",
    stabbr: "NY",
    cty_name: "SUFFOLK",
  }, 2023);
  assert.equal(record.zip_code, "00501");
  assert.equal(record.establishments, 5);
  assert.equal(record.employment_suppression_code, "G");
  assert.equal(record.annual_payroll_thousands_usd, 526);
});

test("normalizes industry size cells without converting suppression to zero", () => {
  const record = normalizeZbpDetail({
    zip: "01001",
    naics: "44----",
    est: "20",
    "n<5": "8",
    n5_9: "N",
    n10_19: "4",
    n20_49: "N",
    n50_99: "N",
    n100_249: "N",
    n250_499: "N",
    n500_999: "N",
    n1000: "N",
    city: "AGAWAM",
    stabbr: "MA",
    cty_name: "HAMPDEN",
  });
  assert.equal(record.size_1_4, 8);
  assert.equal(record.size_1_4_suppression_code, null);
  assert.equal(record.size_5_9, null);
  assert.equal(record.size_5_9_suppression_code, "N");
});

test("builds a ZIP/ZCTA union and retains missing coverage as null", () => {
  const totals = [
    { ...normalizeZbpTotal({ zip: "00501", est: "5" }, 2023) },
    { ...normalizeZbpTotal({ zip: "99999", est: "2" }, 2023) },
  ];
  const zctas = [
    { geo_id: "zcta:00501", geoid: "00501", zcta: "00501", geometry_file: "prefix=0.geojson" },
    { geo_id: "zcta:01001", geoid: "01001", zcta: "01001", geometry_file: "prefix=0.geojson" },
  ];
  const result = buildZipCoverage(totals, zctas, 2023);
  assert.deepEqual(result.counts, {
    union_zip_codes: 3,
    zbp_zip_codes: 2,
    zcta_zip_codes: 2,
    zbp_and_zcta: 1,
    zbp_without_zcta: 1,
    zcta_without_published_zbp: 1,
    authoritative_current_usps_zip_codes: null,
  });
  const zctaOnly = result.records.find((record) => record.zip_code === "01001");
  assert.equal(zctaOnly.employer_baseline.status, "not-published-for-zip");
  assert.equal(zctaOnly.employer_baseline.establishments, null);
  assert.match(zctaOnly.employer_baseline.provenance.source_record_id, /^absence:/);
  assert.equal(zctaOnly.current_usps_validity.status, "unverified");
});

test("discovers the newest Census year with both ZBP archives", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/datasets/")) {
      return new Response('<a href="2022/">2022</a><a href="2023/">2023</a>', { status: 200 });
    }
    if (String(url).includes("/2023/zbp23")) {
      return new Response(null, {
        status: 200,
        headers: { "content-length": "123", "last-modified": "Thu, 26 Jun 2025 12:00:00 GMT" },
      });
    }
    return new Response(null, { status: 404 });
  };
  const release = await discoverLatestZbp({ fetchImpl });
  assert.equal(release.referenceYear, 2023);
  assert.match(release.totalsUrl, /zbp23totals\.zip$/);
  assert.equal(requests.filter((request) => request.method === "HEAD").length, 2);
});
