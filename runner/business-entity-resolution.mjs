import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";

export const ENTITY_RESOLUTION_SCHEMA_VERSION = "1.0.0";
export const ENTITY_RESOLUTION_PROFILE_VERSION = "business-location-match-profile@1.0.0";
export const ENTITY_RESOLUTION_RULESET_VERSION = "business-entity-resolution@1.0.0";

const STREET_SUFFIXES = new Map(Object.entries({
  STREET: "ST", ST: "ST",
  ROAD: "RD", RD: "RD",
  AVENUE: "AVE", AVE: "AVE",
  BOULEVARD: "BLVD", BLVD: "BLVD",
  DRIVE: "DR", DR: "DR",
  LANE: "LN", LN: "LN",
  COURT: "CT", CT: "CT",
  CIRCLE: "CIR", CIR: "CIR",
  HIGHWAY: "HWY", HWY: "HWY",
  PARKWAY: "PKWY", PKWY: "PKWY",
  PLACE: "PL", PL: "PL",
  TERRACE: "TER", TER: "TER",
  TRAIL: "TRL", TRL: "TRL",
  TURNPIKE: "TPKE", TPKE: "TPKE",
}));

const DIRECTIONS = new Map(Object.entries({
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
}));

const CORPORATE_SUFFIXES = new Set([
  "ASSOCIATION", "ASSN", "CO", "COMPANY", "CORP", "CORPORATION", "INC", "INCORPORATED",
  "LLC", "LLP", "LP", "LTD", "LIMITED", "NA", "PC", "PLLC",
]);

const GENERIC_NAME_TOKENS = new Set([
  "BRANCH", "CORPORATE", "FACILITY", "HEADQUARTERS", "LOCATION", "MAIN", "OFFICE", "PLANT", "STORE",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, parts) {
  return `${prefix}:${sha256(JSON.stringify(parts)).slice(0, 32)}`;
}

function resolvedEntityId(entityType, parts) {
  return `${entityType}:resolved_${sha256(JSON.stringify(parts)).slice(0, 32)}`;
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function normalizeMatchText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toUpperCase()
    .replaceAll("&", " AND ")
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
  return normalized || null;
}

function canonicalTokens(value, maps = []) {
  const text = normalizeMatchText(value);
  if (!text) return [];
  return text.split(" ").map((token) => {
    for (const map of maps) {
      if (map.has(token)) return map.get(token);
    }
    return token;
  });
}

export function normalizeBusinessName(value) {
  const strict = normalizeMatchText(value);
  if (!strict) return { strict: null, comparison_tokens: [], generic: true };
  const strictTokens = strict.split(" ");
  const comparisonTokens = strictTokens.filter((token) => !CORPORATE_SUFFIXES.has(token));
  const effectiveTokens = comparisonTokens.length > 0 ? comparisonTokens : strictTokens;
  const meaningful = effectiveTokens.filter((token) => token.length > 2 && !GENERIC_NAME_TOKENS.has(token));
  return {
    strict,
    comparison_tokens: [...new Set(effectiveTokens)],
    generic: meaningful.length === 0,
  };
}

function addressKind(street) {
  const normalized = normalizeMatchText(street) ?? "";
  if (/^(P O|PO|POST OFFICE) BOX\b/.test(normalized)) return "po-box";
  if (/^(RR|RURAL ROUTE|HC|HIGHWAY CONTRACT)\b/.test(normalized)) return "route";
  return normalized ? "street" : "unknown";
}

export function normalizeBusinessAddress(address = {}) {
  const streetTokens = canonicalTokens(address.street, [DIRECTIONS, STREET_SUFFIXES]);
  const unitTokens = canonicalTokens(address.unit_or_additional);
  const city = normalizeMatchText(address.city);
  const state = normalizeMatchText(address.state);
  const zipCode = /^\d{5}$/.test(String(address.zip_code ?? "")) ? String(address.zip_code) : null;
  const kind = addressKind(address.street);
  const street = streetTokens.join(" ") || null;
  const unit = unitTokens.join(" ") || null;
  const complete = Boolean(street && city && /^[A-Z]{2}$/.test(state ?? "") && zipCode);
  return {
    kind,
    street,
    unit,
    city,
    state,
    zip_code: zipCode,
    complete,
    match_key: complete ? [kind, street, unit ?? "", city, state, zipCode].join("|") : null,
  };
}

function allAssertions(reconciled) {
  return [...(reconciled.assertions ?? []), ...(reconciled.locationAssertions ?? [])];
}

function assertionValues(assertions, subjectId, predicate) {
  return assertions.filter((item) => item.subject_entity_id === subjectId && item.predicate === predicate).map((item) => item.value);
}

function stringName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.name ?? value.value ?? null;
  return null;
}

export function createLocationMatchProfile(record, reconciled) {
  const site = reconciled.entities?.find((entity) => entity.entity_type === "physical_site");
  const establishment = reconciled.entities?.find((entity) => entity.entity_type === "establishment");
  if (!site && !establishment) return null;
  if (!site || !establishment) throw new Error(`Location reconciliation ${record.normalized_record_id ?? "<unknown>"} is missing a site or establishment.`);
  const assertions = allAssertions(reconciled);
  const addressValues = assertionValues(assertions, site.entity_id, "site.address");
  if (addressValues.length !== 1) throw new Error(`Location ${record.normalized_record_id} must have exactly one physical site address assertion.`);
  const address = addressValues[0];
  const normalizedAddress = normalizeBusinessAddress(address);
  if (normalizedAddress.zip_code !== reconciled.zipCode) {
    throw new Error(`Location ${record.normalized_record_id} has an inconsistent match-address ZIP.`);
  }
  const rawNames = [
    ...assertionValues(assertions, establishment.entity_id, "establishment.name"),
    ...assertionValues(assertions, establishment.entity_id, "establishment.other-name"),
  ].map(stringName).filter(Boolean);
  const names = [...new Set(rawNames)].map((name) => ({ raw: name, ...normalizeBusinessName(name) }));
  const identifiers = assertionValues(assertions, establishment.entity_id, "establishment.external-identifier")
    .filter((identifier) => identifier?.type && identifier?.value)
    .map((identifier) => ({ type: identifier.type, value: String(identifier.value) }));
  const organizationEntityId = reconciled.relationships?.find(
    (item) => item.relationship_type === "operates" && item.object_entity_id === establishment.entity_id,
  )?.subject_entity_id ?? null;
  const location = assertionValues(assertions, site.entity_id, "site.location")[0] ?? null;
  const sourceStatus = assertionValues(assertions, establishment.entity_id, "establishment.source-status")[0] ?? null;
  const source = record.provenance;
  if (!source?.source_id || !source.source_release_id || !source.source_record_id || !source.ingest_run_id || !source.transformation_version || !source.policy_id) {
    throw new Error(`Location ${record.normalized_record_id} has incomplete source provenance.`);
  }
  return {
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    profile_version: ENTITY_RESOLUTION_PROFILE_VERSION,
    profile_id: stableId("location-profile", [site.entity_id, establishment.entity_id, source.source_release_id, source.source_record_id]),
    zip_code: reconciled.zipCode,
    site_entity_id: site.entity_id,
    establishment_entity_id: establishment.entity_id,
    organization_entity_id: organizationEntityId,
    address,
    normalized_address: normalizedAddress,
    address_match_key_sha256: normalizedAddress.match_key ? sha256(normalizedAddress.match_key) : null,
    names,
    primary_name_match_key_sha256: names[0]?.strict ? sha256(names[0].strict) : null,
    location,
    external_identifiers: identifiers,
    source_status: sourceStatus,
    observed_at: record.observed_at,
    source: { ...source },
    export_policy: record.export_policy ?? "public",
  };
}

function tokenSimilarity(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

function bigrams(value) {
  const compact = String(value ?? "").replaceAll(" ", "");
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  return new Set(Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2)));
}

function diceSimilarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return (2 * intersection) / (a.size + b.size);
}

export function scoreBusinessNames(left, right) {
  if (!left?.strict || !right?.strict) return { score: 0, token_jaccard: 0, bigram_dice: 0, exact: false };
  const tokenJaccard = tokenSimilarity(left.comparison_tokens, right.comparison_tokens);
  const bigramDice = diceSimilarity(left.strict, right.strict);
  return {
    score: Number(((0.55 * tokenJaccard) + (0.45 * bigramDice)).toFixed(6)),
    token_jaccard: Number(tokenJaccard.toFixed(6)),
    bigram_dice: Number(bigramDice.toFixed(6)),
    exact: left.strict === right.strict,
  };
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const value = key(record);
    if (value === null || value === undefined) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record);
  }
  return groups;
}

function sourceIdentity(profile) {
  return `${profile.source.source_id}|${profile.source.source_release_id}`;
}

function automaticAlias(profile, entityType, resolvedEntityId, ruleId, evidence, createdAt) {
  const subjectEntityId = entityType === "physical_site" ? profile.site_entity_id : profile.establishment_entity_id;
  return {
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    decision_id: stableId("resolution-decision", [entityType, subjectEntityId, resolvedEntityId, ruleId]),
    decision_type: "automatic-link",
    decision_status: "active",
    entity_type: entityType,
    subject_entity_id: subjectEntityId,
    resolved_entity_id: resolvedEntityId,
    score: 1,
    rule_id: ruleId,
    ruleset_version: ENTITY_RESOLUTION_RULESET_VERSION,
    evidence,
    source_profile_id: profile.profile_id,
    source: profile.source,
    observed_at: profile.observed_at,
    decided_at: createdAt,
    reversible: true,
    export_policy: "local-review-only",
  };
}

function reviewDecision(left, right, similarity, createdAt) {
  const pair = [left.establishment_entity_id, right.establishment_entity_id].sort();
  const score = Number((0.55 + (0.45 * similarity.score)).toFixed(6));
  return {
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    decision_id: stableId("resolution-decision", ["establishment", ...pair, "review-exact-address-name-similarity@1.0.0"]),
    decision_type: "review-candidate",
    decision_status: "pending-review",
    entity_type: "establishment",
    left_entity_id: pair[0],
    right_entity_id: pair[1],
    score,
    rule_id: "review-exact-address-name-similarity@1.0.0",
    ruleset_version: ENTITY_RESOLUTION_RULESET_VERSION,
    evidence: {
      address_exact: true,
      address_match_key_sha256: left.address_match_key_sha256,
      left_name: left.names[0].strict,
      right_name: right.names[0].strict,
      name_similarity: similarity,
      source_ids: [left.source.source_id, right.source.source_id].sort(),
    },
    left_profile_id: left.profile_id,
    right_profile_id: right.profile_id,
    decided_at: createdAt,
    reversible: true,
    export_policy: "local-review-only",
  };
}

function pairCandidates(profiles, maximumGroupSize) {
  if (profiles.length <= maximumGroupSize) return [profiles];
  return [...groupBy(profiles, (profile) => profile.names[0]?.comparison_tokens.find((token) => token.length > 2) ?? null).values()]
    .filter((group) => group.length <= maximumGroupSize);
}

export function resolveLocationProfiles(profiles, {
  createdAt = new Date().toISOString(),
  reviewThreshold = 0.78,
  maximumReviewGroupSize = 50,
} = {}) {
  if (!Array.isArray(profiles)) throw new Error("profiles must be an array.");
  if (!Number.isFinite(reviewThreshold) || reviewThreshold <= 0 || reviewThreshold >= 1) throw new Error("reviewThreshold must be between zero and one.");
  if (!Number.isInteger(maximumReviewGroupSize) || maximumReviewGroupSize < 2) throw new Error("maximumReviewGroupSize must be at least two.");
  const profileIds = new Set();
  for (const profile of profiles) {
    const matchKey = profile.normalized_address?.match_key;
    if (profile.schema_version !== ENTITY_RESOLUTION_SCHEMA_VERSION || profile.profile_version !== ENTITY_RESOLUTION_PROFILE_VERSION
      || !profile.profile_id || profileIds.has(profile.profile_id) || !/^\d{5}$/.test(profile.zip_code ?? "")
      || !profile.site_entity_id || !profile.establishment_entity_id
      || profile.normalized_address?.complete !== Boolean(matchKey) || profile.normalized_address?.zip_code !== profile.zip_code
      || (matchKey ? sha256(matchKey) !== profile.address_match_key_sha256 : profile.address_match_key_sha256 !== null)) {
      throw new Error(`Invalid or duplicate location match profile ${profile.profile_id ?? "<unknown>"}.`);
    }
    profileIds.add(profile.profile_id);
  }

  const decisions = [];
  const automaticEstablishmentPairs = new Set();
  const addressGroups = groupBy(profiles.filter((profile) => profile.normalized_address.match_key), (profile) => profile.normalized_address.match_key);
  let multiMemberStreetAddressGroups = 0;
  let reviewGroupsSkippedForSize = 0;
  for (const [addressKey, rawGroup] of [...addressGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const group = [...rawGroup].sort((a, b) => a.profile_id.localeCompare(b.profile_id));
    const siteProfiles = [...new Map(group.map((profile) => [profile.site_entity_id, profile])).values()];
    const eligibleStreetAddress = group.every((profile) => profile.normalized_address.kind === "street" && profile.normalized_address.complete === true);
    if (eligibleStreetAddress && siteProfiles.length > 1) {
      multiMemberStreetAddressGroups += 1;
      const resolvedSiteId = resolvedEntityId("site", [addressKey]);
      const evidence = {
        address_exact: true,
        normalized_address: group[0].normalized_address,
        address_match_key_sha256: group[0].address_match_key_sha256,
        member_count: siteProfiles.length,
      };
      for (const profile of siteProfiles) {
        decisions.push(automaticAlias(profile, "physical_site", resolvedSiteId, "site-exact-complete-street-address@1.0.0", evidence, createdAt));
      }
    }
    if (!eligibleStreetAddress) continue;

    const exactNameGroups = groupBy(group.filter((profile) => profile.names[0]?.strict), (profile) => profile.names[0].strict);
    for (const [nameKey, rawNameGroup] of exactNameGroups) {
      const nameGroup = [...new Map(rawNameGroup.map((profile) => [profile.establishment_entity_id, profile])).values()];
      const sourceCounts = Map.groupBy(nameGroup, sourceIdentity);
      const unambiguousAcrossSources = sourceCounts.size > 1 && [...sourceCounts.values()].every((members) => members.length === 1);
      if (nameGroup.length > 1 && unambiguousAcrossSources && !nameGroup[0].names[0].generic) {
        const resolvedEstablishmentId = resolvedEntityId("establishment", [addressKey, nameKey]);
        const evidence = {
          address_exact: true,
          name_exact: true,
          normalized_address: nameGroup[0].normalized_address,
          normalized_name: nameKey,
          member_count: nameGroup.length,
          source_ids: nameGroup.map((profile) => profile.source.source_id).sort(),
        };
        for (const profile of nameGroup) {
          decisions.push(automaticAlias(profile, "establishment", resolvedEstablishmentId, "establishment-exact-address-and-non-generic-name@1.0.0", evidence, createdAt));
        }
        for (let left = 0; left < nameGroup.length; left += 1) {
          for (let right = left + 1; right < nameGroup.length; right += 1) {
            automaticEstablishmentPairs.add([nameGroup[left].establishment_entity_id, nameGroup[right].establishment_entity_id].sort().join("|"));
          }
        }
      }
    }

    const namedProfiles = group.filter((profile) => profile.names[0]?.strict);
    const candidateGroups = pairCandidates(namedProfiles, maximumReviewGroupSize);
    if (namedProfiles.length > maximumReviewGroupSize && candidateGroups.length === 0) reviewGroupsSkippedForSize += 1;
    const candidateIds = new Set();
    for (const candidateGroup of candidateGroups) {
      for (let leftIndex = 0; leftIndex < candidateGroup.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < candidateGroup.length; rightIndex += 1) {
          const left = candidateGroup[leftIndex];
          const right = candidateGroup[rightIndex];
          if (sourceIdentity(left) === sourceIdentity(right) || left.establishment_entity_id === right.establishment_entity_id) continue;
          const pairKey = [left.establishment_entity_id, right.establishment_entity_id].sort().join("|");
          if (automaticEstablishmentPairs.has(pairKey) || candidateIds.has(pairKey)) continue;
          const similarity = scoreBusinessNames(left.names[0], right.names[0]);
          const score = 0.55 + (0.45 * similarity.score);
          if (score < reviewThreshold) continue;
          decisions.push(reviewDecision(left, right, similarity, createdAt));
          candidateIds.add(pairKey);
        }
      }
    }
  }

  decisions.sort((a, b) => a.decision_id.localeCompare(b.decision_id));
  const siteAliases = decisions.filter((decision) => decision.decision_type === "automatic-link" && decision.entity_type === "physical_site");
  const establishmentAliases = decisions.filter((decision) => decision.decision_type === "automatic-link" && decision.entity_type === "establishment");
  const reviewCandidates = decisions.filter((decision) => decision.decision_type === "review-candidate");
  return {
    decisions,
    summary: {
      profiles: profiles.length,
      address_groups: addressGroups.size,
      multi_member_street_address_groups: multiMemberStreetAddressGroups,
      site_alias_decisions: siteAliases.length,
      establishment_alias_decisions: establishmentAliases.length,
      review_candidate_decisions: reviewCandidates.length,
      review_groups_skipped_for_size: reviewGroupsSkippedForSize,
    },
  };
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function readGzipRecords(filePath) {
  const records = [];
  const input = createReadStream(filePath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) records.push(JSON.parse(line));
  }
  return records;
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function loadRegistryProfiles(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "Registry manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "national-business-registry" || manifest.status !== "published-partial"
    || !["1.2.0", "1.3.0", "1.4.0"].includes(manifest.publisher?.version) || manifest.complete_national_business_registry !== false) {
    throw new Error("A compatible national business registry 1.2.0, 1.3.0, or 1.4.0 partial release with match profiles is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const artifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip")
    .sort((a, b) => a.path.localeCompare(b.path)) ?? [];
  if (artifacts.length !== 100) throw new Error(`Expected 100 registry location-profile partitions; found ${artifacts.length}.`);
  for (const artifact of artifacts) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `Registry profile artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Registry profile artifact ${artifact.path} failed checksum validation.`);
  }
  if (artifacts.reduce((sum, artifact) => sum + artifact.record_count, 0) !== manifest.coverage?.resolution_location_profiles
    || manifest.coverage?.resolution_location_profiles !== manifest.coverage?.physical_sites) {
    throw new Error("Registry location-profile counts do not reconcile with physical sites.");
  }
  return { manifest, manifestSha256: sha256(manifestBuffer), releaseDirectory, artifacts };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildBusinessEntityResolution({
  outputRoot,
  registryPointer,
  now = () => new Date(),
  logger = console.log,
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!registryPointer) throw new Error("registryPointer is required.");
  const registry = await loadRegistryProfiles(registryPointer);
  const createdAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `business-entity-resolution-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  const totals = {
    profiles: 0,
    address_groups: 0,
    multi_member_street_address_groups: 0,
    site_alias_decisions: 0,
    establishment_alias_decisions: 0,
    review_candidate_decisions: 0,
    review_groups_skipped_for_size: 0,
  };
  for (const artifact of registry.artifacts) {
    const zip2 = artifact.path.match(/zip2=(\d{2})/)?.[1];
    if (!zip2) throw new Error(`Cannot determine ZIP2 partition for ${artifact.path}.`);
    const profiles = await readGzipRecords(path.join(registry.releaseDirectory, artifact.path));
    if (profiles.length !== artifact.record_count || profiles.some((profile) => profile.zip_code.slice(0, 2) !== zip2)) {
      throw new Error(`Registry profile partition ${artifact.path} failed record validation.`);
    }
    const resolved = resolveLocationProfiles(profiles, { createdAt });
    for (const [key, value] of Object.entries(resolved.summary)) totals[key] += value;
    const buffer = gzipSync(jsonLines(resolved.decisions), { level: 9 });
    artifacts.push(await writeArtifact(stagingDirectory, `decisions/zip2=${zip2}.jsonl.gz`, buffer, {
      artifact_type: "entity-resolution-decision-jsonl-gzip",
      record_count: resolved.decisions.length,
      source_profile_count: profiles.length,
      zip2,
      distribution_policy: "local-review-only",
    }));
    logger(`Resolved ZIP2 ${zip2}: ${profiles.length.toLocaleString("en-US")} profiles, ${resolved.decisions.length.toLocaleString("en-US")} decisions.`);
  }
  artifacts.push(await writeArtifact(stagingDirectory, "derived/resolution-summary.json", json(totals), {
    artifact_type: "entity-resolution-summary-json",
    distribution_policy: "aggregate",
  }));
  const manifest = {
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    dataset_id: "national-business-entity-resolution",
    publisher: { id: "national-business-entity-resolution", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: "published-reviewable-partial",
    complete_entity_resolution: false,
    ruleset_version: ENTITY_RESOLUTION_RULESET_VERSION,
    dependency: {
      dataset_id: registry.manifest.dataset_id,
      release_id: registry.manifest.release_id,
      manifest_sha256: registry.manifestSha256,
    },
    coverage: totals,
    decision_semantics: {
      physical_site_automatic_link: "Exact complete normalized street address, including unit when reported.",
      establishment_automatic_link: "Exact eligible site address and exact non-generic normalized name, with one member per source release.",
      review_candidate: "Exact eligible site address and name evidence not eligible for an automatic establishment link, scored at or above 0.78.",
      not_inferred: ["ownership", "parent company", "general operating status", "co-location as establishment identity", "name-only identity"],
    },
    application: "Automatic decisions provide reversible resolved-entity aliases; they do not overwrite source assertions or provisional source entity IDs. Review candidates remain unapplied.",
    export_policy: "Local review only until benchmarked precision and contributing-source policy checks authorize an export.",
    policy_profile: "config/source-policies/national-business-entity-resolution.json",
    limitations: [
      "Exact addresses can still be shared, stale, incomplete, or reported inconsistently; site aliases remain reversible.",
      "PO Boxes and rural-route-style addresses do not create automatic site or establishment links.",
      "A shared site never by itself merges establishments, organizations, owners, or parent companies.",
      "No fuzzy candidate is automatically linked in ruleset 1.0.0.",
      "The release is incomplete because many entities have insufficient or ambiguous cross-source evidence.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  await mkdir(outputRoot, { recursive: true });
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: createdAt,
    status: manifest.status,
  }), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published entity-resolution release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyBusinessEntityResolution(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "national-business-entity-resolution" || manifest.publisher?.version !== "1.0.0"
    || manifest.status !== "published-reviewable-partial" || manifest.complete_entity_resolution !== false
    || manifest.ruleset_version !== ENTITY_RESOLUTION_RULESET_VERSION || manifest.dependency?.dataset_id !== "national-business-registry"
    || !manifest.dependency?.release_id || !/^[a-f0-9]{64}$/.test(manifest.dependency?.manifest_sha256 ?? "")) {
    failures.push({ path: "manifest.json", reason: "unexpected dataset, status, completeness, or ruleset" });
  }
  const artifactPaths = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    try {
      if (artifactPaths.has(artifact.path) || !Number.isInteger(artifact.bytes) || artifact.bytes < 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) {
        throw new Error("invalid or duplicate artifact metadata");
      }
      artifactPaths.add(artifact.path);
      assertContained(releaseDirectory, filename, `Resolution artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const decisionArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "entity-resolution-decision-jsonl-gzip") ?? [];
  if (decisionArtifacts.length !== 100) failures.push({ path: "decisions", reason: `expected 100 partitions; found ${decisionArtifacts.length}` });
  const summaryArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "entity-resolution-summary-json") ?? [];
  if (summaryArtifacts.length !== 1) {
    failures.push({ path: "derived/resolution-summary.json", reason: `expected one summary artifact; found ${summaryArtifacts.length}` });
  } else {
    try {
      const summary = JSON.parse(await readFile(path.join(releaseDirectory, summaryArtifacts[0].path), "utf8"));
      const summaryEntries = Object.entries(summary).sort(([left], [right]) => left.localeCompare(right));
      const coverageEntries = Object.entries(manifest.coverage ?? {}).sort(([left], [right]) => left.localeCompare(right));
      if (JSON.stringify(summaryEntries) !== JSON.stringify(coverageEntries)
        || summaryEntries.some(([, value]) => !Number.isInteger(value) || value < 0)) {
        throw new Error("summary does not equal valid non-negative manifest coverage");
      }
    } catch (error) {
      failures.push({ path: summaryArtifacts[0].path, reason: error.message });
    }
  }
  const decisionIds = new Set();
  const automaticSubjects = new Set();
  const zip2Partitions = new Set();
  const counts = { site_alias_decisions: 0, establishment_alias_decisions: 0, review_candidate_decisions: 0 };
  let sourceProfileCount = 0;
  for (const artifact of decisionArtifacts) {
    try {
      if (!/^decisions\/zip2=\d{2}\.jsonl\.gz$/.test(artifact.path) || !Number.isInteger(artifact.source_profile_count)
        || artifact.source_profile_count < 0 || artifact.distribution_policy !== "local-review-only") {
        throw new Error("invalid partition metadata");
      }
      const zip2 = artifact.path.match(/zip2=(\d{2})/)?.[1];
      if (zip2Partitions.has(zip2)) throw new Error(`duplicate ZIP2 partition ${zip2}`);
      zip2Partitions.add(zip2);
      sourceProfileCount += artifact.source_profile_count;
      const records = await readGzipRecords(path.join(releaseDirectory, artifact.path));
      if (records.length !== artifact.record_count) throw new Error("record count mismatch");
      for (const decision of records) {
        if (!/^resolution-decision:[a-f0-9]{32}$/.test(decision.decision_id ?? "") || decisionIds.has(decision.decision_id)
          || decision.ruleset_version !== ENTITY_RESOLUTION_RULESET_VERSION
          || decision.schema_version !== ENTITY_RESOLUTION_SCHEMA_VERSION || decision.reversible !== true
          || decision.export_policy !== "local-review-only" || !Number.isFinite(decision.score) || decision.score < 0 || decision.score > 1
          || typeof decision.decided_at !== "string" || Number.isNaN(Date.parse(decision.decided_at))) {
          throw new Error(`invalid or duplicate decision ${decision.decision_id ?? "<unknown>"}`);
        }
        decisionIds.add(decision.decision_id);
        if (decision.decision_type === "automatic-link") {
          const subjectKey = `${decision.entity_type}|${decision.subject_entity_id}`;
          const resolvedPattern = decision.entity_type === "physical_site"
            ? /^site:resolved_[a-f0-9]{32}$/
            : /^establishment:resolved_[a-f0-9]{32}$/;
          const expectedRule = decision.entity_type === "physical_site"
            ? "site-exact-complete-street-address@1.0.0"
            : "establishment-exact-address-and-non-generic-name@1.0.0";
          const expectedDecisionId = stableId("resolution-decision", [decision.entity_type, decision.subject_entity_id, decision.resolved_entity_id, expectedRule]);
          const evidence = decision.evidence ?? {};
          const commonEvidenceValid = evidence.address_exact === true && Number.isInteger(evidence.member_count) && evidence.member_count >= 2;
          const ruleEvidenceValid = decision.entity_type === "physical_site"
            ? evidence.normalized_address?.kind === "street" && evidence.normalized_address?.complete === true
              && sha256(evidence.normalized_address.match_key ?? "") === evidence.address_match_key_sha256
            : evidence.name_exact === true && typeof evidence.normalized_name === "string" && evidence.normalized_name.length > 0
              && normalizeBusinessName(evidence.normalized_name).generic === false && Array.isArray(evidence.source_ids)
              && evidence.source_ids.length >= 2;
          if (automaticSubjects.has(subjectKey) || decision.decision_status !== "active" || decision.score !== 1
            || !["physical_site", "establishment"].includes(decision.entity_type)
            || !resolvedPattern.test(decision.resolved_entity_id ?? "") || decision.rule_id !== expectedRule
            || decision.decision_id !== expectedDecisionId || !commonEvidenceValid || !ruleEvidenceValid
            || !/^location-profile:[a-f0-9]{32}$/.test(decision.source_profile_id ?? "")
            || typeof decision.source?.source_id !== "string" || typeof decision.source?.source_release_id !== "string"
            || typeof decision.source?.source_record_id !== "string" || !decision.observed_at) {
            throw new Error(`invalid automatic decision ${decision.decision_id}`);
          }
          automaticSubjects.add(subjectKey);
          counts[decision.entity_type === "physical_site" ? "site_alias_decisions" : "establishment_alias_decisions"] += 1;
        } else if (decision.decision_type === "review-candidate") {
          const expectedDecisionId = stableId("resolution-decision", ["establishment", decision.left_entity_id, decision.right_entity_id, "review-exact-address-name-similarity@1.0.0"]);
          const similarity = scoreBusinessNames(normalizeBusinessName(decision.evidence?.left_name), normalizeBusinessName(decision.evidence?.right_name));
          const expectedScore = Number((0.55 + (0.45 * similarity.score)).toFixed(6));
          if (decision.decision_status !== "pending-review" || decision.entity_type !== "establishment"
            || !/^establishment:/.test(decision.left_entity_id ?? "") || !/^establishment:/.test(decision.right_entity_id ?? "")
            || decision.left_entity_id >= decision.right_entity_id || decision.rule_id !== "review-exact-address-name-similarity@1.0.0"
            || decision.decision_id !== expectedDecisionId || decision.score < 0.78 || decision.score !== expectedScore
            || decision.evidence?.address_exact !== true || !/^[a-f0-9]{64}$/.test(decision.evidence?.address_match_key_sha256 ?? "")
            || JSON.stringify(decision.evidence?.name_similarity) !== JSON.stringify(similarity)
            || !Array.isArray(decision.evidence?.source_ids) || decision.evidence.source_ids.length !== 2
            || !/^location-profile:[a-f0-9]{32}$/.test(decision.left_profile_id ?? "")
            || !/^location-profile:[a-f0-9]{32}$/.test(decision.right_profile_id ?? "")
            || decision.left_profile_id === decision.right_profile_id) {
            throw new Error(`invalid review decision ${decision.decision_id}`);
          }
          counts.review_candidate_decisions += 1;
        } else {
          throw new Error(`unsupported decision type ${decision.decision_type}`);
        }
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (zip2Partitions.size !== 100) failures.push({ path: "decisions", reason: "ZIP2 partitions are not unique and complete" });
  for (const [key, value] of Object.entries(counts)) {
    if (value !== manifest.coverage?.[key]) failures.push({ path: "manifest.json", reason: `${key} does not reconcile` });
  }
  if (sourceProfileCount !== manifest.coverage?.profiles) failures.push({ path: "manifest.json", reason: "profile count does not reconcile" });
  if (failures.length > 0) {
    const error = new Error(`Business entity-resolution verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    status: manifest.status,
    ruleset_version: manifest.ruleset_version,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
  };
}
