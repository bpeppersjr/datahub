import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { APP_ROOT } from "./paths.mjs";
import {
  demographicCellContract,
  expectedDemographicCells,
  expectedVariables,
  inspectAcsZctaDemographicPrerequisites,
  validateAcsZctaDemographicCandidateRow,
} from "./acs-zcta-demographic-admission.mjs";

test("production contract is fail-closed and replays the exact governed denominator", async () => {
  const result = await inspectAcsZctaDemographicPrerequisites();
  assert.equal(result.contract_inspection_only, true);
  assert.equal(result.substantive_publication_supported, false);
  assert.equal(result.governed_zctas, 33791);
  assert.deepEqual(result.blockers, [
    "missing-trusted-retained-official-acs-group-metadata",
    "missing-approved-structured-authorization-receipt",
    "missing-immutable-governed-acs-source-release",
    "unresolved-official-sentinel-and-annotation-semantics",
  ]);
  assert.deepEqual(result.claims, {
    network_requests: 0,
    current_pointer_written: false,
    production_enrollment: false,
    source_ingestion_performed: false,
    staging_created: false,
    release_created: false,
    percentages_emitted: false,
  });
  assert.equal(
    await fs
      .stat(path.join(APP_ROOT, "data/acs-zcta-demographic-admission"))
      .then(
        () => true,
        () => false,
      ),
    false,
  );
});

test("official table ranges include corrected B02001 001 through 010", async () => {
  const config = JSON.parse(
    await fs.readFile(
      path.join(APP_ROOT, "config/acs-zcta-demographic-admission.json"),
    ),
  );
  assert.equal(expectedVariables(config, "B01001").at(-1), "B01001_049");
  assert.equal(expectedVariables(config, "B02001").at(-1), "B02001_010");
  assert.equal(expectedVariables(config, "B03002").at(-1), "B03002_021");
  assert.equal(expectedVariables(config, "B04006").at(-1), "B04006_109");
});

test("cell contract preserves estimate, MOE, EA, MA, null and sentinel semantics", () => {
  assert.deepEqual(demographicCellContract("B02001_001"), {
    estimate: "B02001_001E",
    margin_of_error: "B02001_001M",
    estimate_annotation: "B02001_001EA",
    margin_of_error_annotation: "B02001_001MA",
    raw_negative_sentinel_preservation_required: true,
    annotation_semantics: "unresolved-until-trusted-official-metadata",
    missing_value: null,
    percentages_emitted: false,
  });
  assert.throws(() => demographicCellContract("bad"), /base variable/);
});

test("offline candidate row validation is closed and preserves raw sentinels and annotations", async () => {
  const config = JSON.parse(
      await fs.readFile(
        path.join(APP_ROOT, "config/acs-zcta-demographic-admission.json"),
      ),
    ),
    variables = expectedDemographicCells(config),
    cells = Object.fromEntries(
      variables.map((variable) => [
        variable,
        {
          estimate: "0",
          margin_of_error: "12",
          estimate_annotation: null,
          margin_of_error_annotation: null,
        },
      ]),
    );
  cells.B01001_001 = {
    estimate: "-666666666",
    margin_of_error: "-222222222",
    estimate_annotation: "source-sentinel",
    margin_of_error_annotation: "source-sentinel",
  };
  const validated = validateAcsZctaDemographicCandidateRow(
    {zcta: "00601", cells},
    config,
  );
  assert.equal(variables.length, 189);
  assert.deepEqual(validated.cells.B01001_001, cells.B01001_001);
  assert.equal(validated.zcta, "00601");
  assert.throws(
    () =>
      validateAcsZctaDemographicCandidateRow(
        {zcta: "00601", cells: {...cells, EXTRA_001: cells.B01001_001}},
        config,
      ),
    /cell roster/,
  );
  assert.throws(
    () =>
      validateAcsZctaDemographicCandidateRow(
        {zcta: "00601", cells: {...cells, B02001_001: {...cells.B02001_001, estimate: 1}}},
        config,
      ),
    /raw E\/M\/EA\/MA/,
  );
  assert.throws(
    () => validateAcsZctaDemographicCandidateRow({zcta: "601", cells}, config),
    /ZCTA identity/,
  );
});

async function cli(args) {
  const child = spawn(
    process.execPath,
    [
      path.join(APP_ROOT, "scripts/build-acs-zcta-demographic-admission.mjs"),
      ...args,
    ],
    { cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (value) => {
    stdout += value;
  });
  child.stderr.on("data", (value) => {
    stderr += value;
  });
  const [code] = await once(child, "exit");
  return { code, stdout, stderr };
}

test("CLI exposes inspect only and rejects publish, declarations, unknown, duplicate and missing flags", async () => {
  const inspected = await cli(["inspect"]);
  assert.equal(inspected.code, 0);
  assert.equal(JSON.parse(inspected.stdout).contract_inspection_only, true);
  for (const args of [
    [],
    ["publish"],
    ["inspect", "--declaration", "x"],
    ["inspect", "--unknown", "x"],
    ["inspect", "--config"],
    ["inspect", "--config", "a", "--config", "b"],
  ]) {
    const result = await cli(args);
    assert.notEqual(result.code, 0, args.join(" "));
  }
});

test("pre-aborted inspection creates no output", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled-inspection"));
  await assert.rejects(
    inspectAcsZctaDemographicPrerequisites({ signal: controller.signal }),
    /cancelled-inspection/,
  );
  assert.equal(
    await fs
      .stat(path.join(APP_ROOT, "data/acs-zcta-demographic-admission"))
      .then(
        () => true,
        () => false,
      ),
    false,
  );
});

test("there is no publish or verify export", async () => {
  const exports = await import("./acs-zcta-demographic-admission.mjs");
  assert.equal("publishAcsZctaDemographicAdmission" in exports, false);
  assert.equal("verifyAcsZctaDemographicAdmission" in exports, false);
});
