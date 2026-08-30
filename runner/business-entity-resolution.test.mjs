import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  buildBusinessEntityResolution,
  createLocationMatchProfile,
  normalizeBusinessAddress,
  normalizeBusinessName,
  resolveLocationProfiles,
  scoreBusinessNames,
  verifyBusinessEntityResolution,
} from "./business-entity-resolution.mjs";

function profile({
  sourceId,
  recordId,
  name,
  street = "10 North Main Street",
  unit = null,
  city = "Chicago",
  state = "IL",
  zipCode = "60601",
  organizationId = null,
}) {
  const siteId = `site:${sourceId}_${recordId}`;
  const establishmentId = `establishment:${sourceId}_${recordId}`;
  const record = {
    normalized_record_id: `${sourceId}:${recordId}`,
    observed_at: "2026-08-30T20:00:00.000Z",
    export_policy: "public",
    provenance: {
      source_id: sourceId,
      source_release_id: `${sourceId}-release`,
      source_record_id: recordId,
      ingest_run_id: `${sourceId}-run`,
      transformation_version: `${sourceId}@1.0.0`,
      policy_id: `${sourceId}-policy`,
    },
  };
  const reconciled = {
    zipCode,
    entities: [
      { entity_id: siteId, entity_type: "physical_site" },
      { entity_id: establishmentId, entity_type: "establishment" },
    ],
    assertions: [
      {
        subject_entity_id: siteId,
        predicate: "site.address",
        value: { street, unit_or_additional: unit, city, state, zip_code: zipCode, country: "US" },
      },
      ...(name ? [{ subject_entity_id: establishmentId, predicate: "establishment.name", value: name }] : []),
      { subject_entity_id: establishmentId, predicate: "establishment.source-status", value: { value: "source-current" } },
    ],
    relationships: [
      { relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId },
      ...(organizationId ? [{ relationship_type: "operates", subject_entity_id: organizationId, object_entity_id: establishmentId }] : []),
    ],
  };
  return createLocationMatchProfile(record, reconciled);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeFixtureRegistry(root, profiles) {
  const releaseId = "registry-resolution-profile-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  const artifacts = [];
  for (let prefix = 0; prefix < 100; prefix += 1) {
    const zip2 = String(prefix).padStart(2, "0");
    const records = profiles.filter((item) => item.zip_code.startsWith(zip2));
    const buffer = gzipSync(records.map((item) => JSON.stringify(item)).join("\n") + (records.length ? "\n" : ""));
    const relativePath = `resolution/location-profiles/zip2=${zip2}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      record_count: records.length,
      artifact_type: "entity-resolution-location-profile-jsonl-gzip",
    });
  }
  const manifest = {
    dataset_id: "national-business-registry",
    release_id: releaseId,
    status: "published-partial",
    complete_national_business_registry: false,
    publisher: { id: "national-business-registry", version: "1.2.0" },
    coverage: { physical_sites: profiles.length, resolution_location_profiles: profiles.length },
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await mkdir(root, { recursive: true });
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

test("normalizes conservative complete street addresses while preserving units and excluding PO Boxes", () => {
  const first = normalizeBusinessAddress({ street: "10 North Main Street", unit_or_additional: "Suite 2", city: "Chicago", state: "IL", zip_code: "60601" });
  const second = normalizeBusinessAddress({ street: "10 N. Main St.", unit_or_additional: "Suite 2", city: "CHICAGO", state: "IL", zip_code: "60601" });
  const anotherUnit = normalizeBusinessAddress({ street: "10 N Main St", unit_or_additional: "Suite 3", city: "Chicago", state: "IL", zip_code: "60601" });
  assert.equal(first.match_key, second.match_key);
  assert.notEqual(first.match_key, anotherUnit.match_key);
  assert.equal(normalizeBusinessAddress({ street: "P.O. Box 20", city: "Chicago", state: "IL", zip_code: "60601" }).kind, "po-box");
});

test("builds a provenance-carrying location profile from registry reconciliation evidence", () => {
  const result = profile({ sourceId: "source-a", recordId: "1", name: "Acme Health, LLC", organizationId: "organization:acme" });
  assert.equal(result.zip_code, "60601");
  assert.equal(result.organization_entity_id, "organization:acme");
  assert.equal(result.names[0].strict, "ACME HEALTH LLC");
  assert.deepEqual(result.names[0].comparison_tokens, ["ACME", "HEALTH"]);
  assert.equal(result.normalized_address.street, "10 N MAIN ST");
  assert.equal(result.source.source_id, "source-a");
});

test("retains an incomplete reported address as an ineligible profile without inventing a match key", () => {
  const result = profile({ sourceId: "source-a", recordId: "incomplete", name: "Ramsey Water Dept", street: "-" });
  assert.equal(result.normalized_address.complete, false);
  assert.equal(result.normalized_address.match_key, null);
  assert.equal(result.address_match_key_sha256, null);
  const resolved = resolveLocationProfiles([result]);
  assert.equal(resolved.summary.profiles, 1);
  assert.equal(resolved.summary.address_groups, 0);
  assert.equal(resolved.decisions.length, 0);
});

test("automatically aliases exact sites and unambiguous exact non-generic establishments", () => {
  const profiles = [
    profile({ sourceId: "source-a", recordId: "1", name: "Acme Health LLC" }),
    profile({ sourceId: "source-b", recordId: "2", name: "ACME HEALTH LLC", street: "10 N. Main St." }),
  ];
  const result = resolveLocationProfiles(profiles, { createdAt: "2026-08-30T21:00:00.000Z" });
  assert.equal(result.summary.site_alias_decisions, 2);
  assert.equal(result.summary.establishment_alias_decisions, 2);
  assert.equal(result.summary.review_candidate_decisions, 0);
  assert.equal(new Set(result.decisions.filter((item) => item.entity_type === "physical_site").map((item) => item.resolved_entity_id)).size, 1);
  assert(result.decisions.every((item) => item.reversible));
});

test("keeps co-located establishments separate and sends similar names only to review", () => {
  const distinct = resolveLocationProfiles([
    profile({ sourceId: "source-a", recordId: "1", name: "Alpha Market" }),
    profile({ sourceId: "source-b", recordId: "2", name: "Beta Pharmacy" }),
  ]);
  assert.equal(distinct.summary.site_alias_decisions, 2);
  assert.equal(distinct.summary.establishment_alias_decisions, 0);
  assert.equal(distinct.summary.review_candidate_decisions, 0);

  const similar = resolveLocationProfiles([
    profile({ sourceId: "source-a", recordId: "3", name: "Acme Health Clinic" }),
    profile({ sourceId: "source-b", recordId: "4", name: "Acme Health Clinics" }),
  ]);
  assert.equal(similar.summary.establishment_alias_decisions, 0);
  assert.equal(similar.summary.review_candidate_decisions, 1);
  assert(similar.decisions.find((item) => item.decision_type === "review-candidate").score >= 0.78);
});

test("does not automatically resolve generic names, ambiguous source multiplicity, or PO Boxes", () => {
  const generic = resolveLocationProfiles([
    profile({ sourceId: "source-a", recordId: "1", name: "Main Office" }),
    profile({ sourceId: "source-b", recordId: "2", name: "Main Office" }),
  ]);
  assert.equal(generic.summary.establishment_alias_decisions, 0);
  assert.equal(generic.summary.review_candidate_decisions, 1);

  const ambiguous = resolveLocationProfiles([
    profile({ sourceId: "source-a", recordId: "3", name: "Acme Health" }),
    profile({ sourceId: "source-a", recordId: "4", name: "Acme Health" }),
    profile({ sourceId: "source-b", recordId: "5", name: "Acme Health" }),
  ]);
  assert.equal(ambiguous.summary.establishment_alias_decisions, 0);
  assert(ambiguous.summary.review_candidate_decisions > 0);

  const poBox = resolveLocationProfiles([
    profile({ sourceId: "source-a", recordId: "6", name: "Acme Health", street: "PO Box 20" }),
    profile({ sourceId: "source-b", recordId: "7", name: "Acme Health", street: "P.O. Box 20" }),
  ]);
  assert.equal(poBox.decisions.length, 0);
});

test("scores normalized business names without converting similarity into an automatic link", () => {
  const score = scoreBusinessNames(normalizeBusinessName("Acme Health Clinic, LLC"), normalizeBusinessName("Acme Health Clinics Inc"));
  assert.equal(score.exact, false);
  assert(score.score > 0.5 && score.score < 1);
});

test("builds and independently verifies an immutable reviewable resolution release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "business-entity-resolution-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profiles = [
    profile({ sourceId: "source-a", recordId: "1", name: "Acme Health LLC" }),
    profile({ sourceId: "source-b", recordId: "2", name: "ACME HEALTH LLC", street: "10 N Main St" }),
  ];
  const registryPointer = await writeFixtureRegistry(path.join(root, "registry"), profiles);
  const result = await buildBusinessEntityResolution({
    outputRoot: path.join(root, "resolution"),
    registryPointer,
    now: () => new Date("2026-08-30T22:00:00.000Z"),
    logger: () => {},
  });
  assert.equal(result.manifest.coverage.profiles, 2);
  assert.equal(result.manifest.coverage.site_alias_decisions, 2);
  assert.equal(result.manifest.coverage.establishment_alias_decisions, 2);
  assert.equal(result.manifest.complete_entity_resolution, false);
  const verified = await verifyBusinessEntityResolution(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.artifact_count, 101);

  const decisionArtifact = result.manifest.artifacts.find((item) => item.record_count > 0 && item.artifact_type === "entity-resolution-decision-jsonl-gzip");
  const decisionPath = path.join(result.releaseDirectory, decisionArtifact.path);
  const records = gunzipSync(await readFile(decisionPath)).toString("utf8").trim().split("\n").map(JSON.parse);
  records[0].rule_id = "unapproved-rule@1.0.0";
  const tampered = gzipSync(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await writeFile(decisionPath, tampered);
  decisionArtifact.bytes = tampered.length;
  decisionArtifact.sha256 = sha256(tampered);
  await writeFile(path.join(result.releaseDirectory, "manifest.json"), `${JSON.stringify(result.manifest)}\n`);
  await assert.rejects(verifyBusinessEntityResolution(path.join(result.releaseDirectory, "manifest.json")), /verification failed/);
});
