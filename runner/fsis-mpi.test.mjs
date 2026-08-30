import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFsisMpi,
  FSIS_DEMOGRAPHIC_REQUIRED_HEADERS,
  FSIS_MPI_HEADERS,
  normalizeFsisEstablishment,
  verifyFsisMpi,
} from "./fsis-mpi.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function headerFingerprint(headers) {
  return sha256(headers.join("\u0000"));
}

function csv(headers, rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return Buffer.from(`${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))].map((row) => row.map(quote).join(",")).join("\n")}\n`);
}

function directory(overrides = {}) {
  return {
    establishment_id: "100", establishment_number: "M100+P100", establishment_name: "Fixture Foods LLC", duns_number: "123456789",
    street: "10 Main St", city: "Chicago", state: "IL", zip: "60601-1234", phone: "(312) 555-0100", grant_date: "1/2/2020",
    activities: "Meat Processing; Poultry Processing", dbas: "Fixture Meats; Fixture Poultry", district: "50", circuit: "5001", size: "Small",
    latitude: "41.885", longitude: "-87.622", county: "Cook County", fips_code: "17031", ...overrides,
  };
}

function demographic(overrides = {}) {
  return {
    establishment_number: "M100+P100", establishment_id: "100", establishment_name: "Fixture Foods LLC",
    active_meat_grant: "Yes", last_meat_grant_edit_date: "1/2/2020", active_voluntary_grant: "", last_voluntary_grant_edit_date: "",
    active_poultry_grant: "Yes", last_poultry_grant_edit_date: "1/3/2020", active_egg_grant: "", last_egg_grant_edit_date: "",
    slaughter: "", processing: "Yes", meat_slaughter: "", poultry_slaughter: "", meat_processing: "Yes", poultry_processing: "Yes", egg_processing: "",
    listeria_alternative: "Alternative 3", processing_volume_category: "4", slaughter_volume_category: "", category_start_date: "6/29/2025", category_end_date: "6/27/2026",
    ...overrides,
  };
}

function context() {
  return {
    runId: "fsis-fixture-run",
    retrievedAt: "2026-08-30T16:00:00.000Z",
    sourceDate: "2026-08-24",
    sourceReleaseId: "fsis-fixture-source",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00956", "60601", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline", release_id: "zbp-fixture", complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("normalizes FSIS establishment identity, ZIP+4, activities, grants, and demographics", () => {
  const normalized = normalizeFsisEstablishment(directory(), demographic(), context());
  assert.equal(normalized.entity_candidates.establishment_id, "establishment:fsis_establishment_100");
  assert.equal(normalized.address.postal_code, "60601-1234");
  assert.deepEqual(normalized.activities, ["Meat Processing", "Poultry Processing"]);
  assert.deepEqual(normalized.active_grants.active, ["meat", "poultry"]);
  assert(normalized.reported_demographics.active_flags.includes("processing"));
  assert.equal(normalized.reported_demographics.categorical_values.listeria_alternative, "Alternative 3");
  assert.equal(normalized.external_identifiers.some((item) => item.type === "duns"), false);
  const puertoRico = normalizeFsisEstablishment(
    directory({ establishment_id: "200", establishment_number: "M200", establishment_name: "Island Foods", state: "PR", zip: "956", fips_code: "72021" }),
    demographic({ establishment_id: "200", establishment_number: "M200", establishment_name: "Island Foods" }),
    context(),
  );
  assert.equal(puertoRico.address.zip_code, "00956");
  assert.throws(() => normalizeFsisEstablishment(directory({ state: "ZZ" }), demographic(), context()), /invalid-us-state/);
});

test("builds and independently verifies a governed FSIS active MPI release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fsis-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const directoryRows = [
    directory(),
    directory({ establishment_id: "200", establishment_number: "M200", establishment_name: "Island Foods", state: "PR", zip: "956", fips_code: "72021", activities: "Meat Slaughter", dbas: "" }),
    directory({ establishment_id: "300", establishment_number: "M300", establishment_name: "Invalid Location", state: "ZZ", zip: "12345" }),
  ];
  const demographicRows = [
    demographic(),
    demographic({ establishment_id: "200", establishment_number: "M200", establishment_name: "Island Foods" }),
    demographic({ establishment_id: "300", establishment_number: "M300", establishment_name: "Invalid Location" }),
  ];
  const directoryPath = path.join(root, "MPI_Directory_by_Establishment_Name.csv");
  const demographicPath = path.join(root, "Dataset_Establishment_Demographic_Data.csv");
  await writeFile(directoryPath, csv(FSIS_MPI_HEADERS, directoryRows));
  await writeFile(demographicPath, csv(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS, demographicRows));
  const result = await buildFsisMpi({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    directoryPath,
    demographicPath,
    sourceDate: "2026-08-24",
    minimumEstablishments: 1,
    maximumQuarantineRate: 0.5,
    schemaFingerprints: {
      directory: headerFingerprint(FSIS_MPI_HEADERS),
      demographic: headerFingerprint(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS),
    },
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_directory_records, 3);
  assert.equal(result.manifest.coverage.accepted_active_establishments, 2);
  assert.equal(result.manifest.coverage.quarantined_records, 1);
  const verified = await verifyFsisMpi(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const partition = result.manifest.artifacts.find((artifact) => artifact.path === "derived/establishments/zip-prefix=6.jsonl.gz");
  const records = await gunzipRecords(path.join(result.releaseDirectory, partition.path));
  assert.equal(records.length, 1);
  assert.equal(JSON.stringify(records).toLowerCase().includes("duns"), false);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "fsis-source-active-directory-csv");
  assert.equal((await readFile(path.join(result.releaseDirectory, sourceArtifact.path), "utf8")).includes("123456789"), true);
});

test("blocks unpinned FSIS schema drift", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fsis-drift-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const directoryPath = path.join(root, "directory.csv");
  const demographicPath = path.join(root, "demographic.csv");
  await writeFile(directoryPath, csv([...FSIS_MPI_HEADERS, "unexpected"], [directory()]));
  await writeFile(demographicPath, csv(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS, [demographic()]));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildFsisMpi({
    outputRoot: path.join(root, "output"),
    zbpPointer,
    directoryPath,
    demographicPath,
    sourceDate: "2026-08-24",
    minimumEstablishments: 1,
    schemaFingerprints: {
      directory: headerFingerprint(FSIS_MPI_HEADERS),
      demographic: headerFingerprint(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS),
    },
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  }), /schema changed/);
});

test("blocks mismatched FSIS directory and demographic identities before normalization", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fsis-join-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const directoryPath = path.join(root, "directory.csv");
  const demographicPath = path.join(root, "demographic.csv");
  await writeFile(directoryPath, csv(FSIS_MPI_HEADERS, [directory()]));
  await writeFile(demographicPath, csv(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS, [demographic({ establishment_name: "Different Name" })]));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildFsisMpi({
    outputRoot: path.join(root, "output"),
    zbpPointer,
    directoryPath,
    demographicPath,
    sourceDate: "2026-08-24",
    minimumEstablishments: 1,
    schemaFingerprints: {
      directory: headerFingerprint(FSIS_MPI_HEADERS),
      demographic: headerFingerprint(FSIS_DEMOGRAPHIC_REQUIRED_HEADERS),
    },
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  }), /identity mismatch/);
});
