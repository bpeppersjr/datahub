import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { APP_ROOT, relativeToApp } from "./paths.mjs";

export const NORMALIZED_US_POSTAL_MIGRATION_ID = "normalized-us-postal-fields-v1";
export const DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION = "config/migrations/normalized-us-postal-fields-v1.json";

function resolveInside(root, candidate) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the datahub root: ${candidate}`);
  }
  return resolved;
}

async function resolveExistingInside(root, candidate) {
  const resolved = resolveInside(root, candidate);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(resolved)]);
  const relative = path.relative(realRoot, realCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path crosses a link or junction outside the datahub root: ${candidate}`);
  }
  return resolved;
}

async function readJson(filePath, label) {
  return (await readJsonDocument(filePath, label)).value;
}

async function readJsonDocument(filePath, label) {
  let source;
  try {
    source = await readFile(filePath);
  } catch (error) {
    throw new Error(`${label} could not be read at ${filePath}: ${error.message}`);
  }
  try {
    return {
      value: JSON.parse(source.toString("utf8")),
      sha256: createHash("sha256").update(source).digest("hex"),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON at ${filePath}: ${error.message}`);
  }
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseSemanticVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  if (!match) throw new Error(`${label} must be an exact major.minor.patch version.`);
  return match.slice(1).map(Number);
}

export function compareSemanticVersions(left, right) {
  const a = parseSemanticVersion(left, "left version");
  const b = parseSemanticVersion(right, "right version");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function parseTransformationReference(value, location) {
  if (typeof value !== "string") return null;
  const separator = value.lastIndexOf("@");
  if (separator < 1 || separator === value.length - 1) return null;
  const id = value.slice(0, separator);
  const version = value.slice(separator + 1);
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  return { id, version, location };
}

export function manifestVersionCandidates(manifest) {
  const candidates = [];
  if (manifest?.connector?.id && manifest.connector.version) {
    candidates.push({ id: manifest.connector.id, version: manifest.connector.version, location: "manifest.connector" });
  }
  if (manifest?.publisher?.id && manifest.publisher.version) {
    candidates.push({ id: manifest.publisher.id, version: manifest.publisher.version, location: "manifest.publisher" });
  }
  const transformationVersion = parseTransformationReference(manifest?.transformation_version, "manifest.transformation_version");
  if (transformationVersion) candidates.push(transformationVersion);
  const transformationId = parseTransformationReference(manifest?.transformation?.id, "manifest.transformation.id");
  if (transformationId) candidates.push(transformationId);
  return candidates;
}

function validateDefinition(definition) {
  if (definition?.migration_id !== NORMALIZED_US_POSTAL_MIGRATION_ID) {
    throw new Error(`Unexpected postal migration ID ${definition?.migration_id ?? "(missing)"}.`);
  }
  if (!Array.isArray(definition.sources) || definition.sources.length === 0) {
    throw new Error("Postal migration definition must contain at least one source.");
  }
  const keys = new Set();
  const datasets = new Set();
  for (const source of definition.sources) {
    for (const property of ["source_key", "dataset_id", "pointer", "connector_config", "minimum_connector_version", "verify_command"]) {
      if (typeof source[property] !== "string" || source[property].length === 0) {
        throw new Error(`Postal migration source is missing ${property}.`);
      }
    }
    parseSemanticVersion(source.minimum_connector_version, `${source.source_key} minimum_connector_version`);
    if (!Array.isArray(source.build_commands) || source.build_commands.length === 0 || source.build_commands.some((command) => typeof command !== "string" || command.length === 0)) {
      throw new Error(`${source.source_key} must define at least one build command.`);
    }
    if (keys.has(source.source_key)) throw new Error(`Duplicate postal migration source key ${source.source_key}.`);
    if (datasets.has(source.dataset_id)) throw new Error(`Duplicate postal migration dataset ID ${source.dataset_id}.`);
    const requiredEnvironment = source.rebuild_prerequisites?.required_environment ?? [];
    const requiredPaths = source.rebuild_prerequisites?.required_paths ?? [];
    if (!Array.isArray(requiredEnvironment) || requiredEnvironment.some((name) => !/^[A-Z][A-Z0-9_]*$/.test(name))) {
      throw new Error(`${source.source_key} rebuild required_environment must contain environment variable names only.`);
    }
    if (!Array.isArray(requiredPaths) || requiredPaths.some((filePath) => typeof filePath !== "string" || filePath.length === 0)) {
      throw new Error(`${source.source_key} rebuild required_paths must contain non-empty paths only.`);
    }
    keys.add(source.source_key);
    datasets.add(source.dataset_id);
  }
  if (definition.execution_order !== undefined) {
    if (!Array.isArray(definition.execution_order) || definition.execution_order.length !== keys.size || new Set(definition.execution_order).size !== keys.size) {
      throw new Error("Postal migration execution_order must list every source key exactly once.");
    }
    for (const key of definition.execution_order) {
      if (!keys.has(key)) throw new Error(`Postal migration execution_order contains unknown source key ${key}.`);
    }
  }
  return definition;
}

function blockedResult(source, pointerPath, reason, details = {}) {
  return {
    source_key: source.source_key,
    dataset_id: source.dataset_id,
    pointer: pointerPath,
    connector_id: details.connectorId ?? null,
    minimum_connector_version: source.minimum_connector_version,
    current_connector_version: details.currentVersion ?? null,
    version_evidence: details.versionEvidence ?? null,
    current_release_id: details.releaseId ?? null,
    status: "blocked",
    reason,
    build_commands: source.build_commands,
    verify_command: source.verify_command,
  };
}

async function applyRebuildPrerequisites(result, source, environment, appRoot) {
  const requiredEnvironment = source.rebuild_prerequisites?.required_environment ?? [];
  const missingEnvironment = requiredEnvironment.filter((name) => !environment[name]);
  const missingPaths = [];
  for (const candidate of source.rebuild_prerequisites?.required_paths ?? []) {
    try {
      await stat(await resolveExistingInside(appRoot, candidate));
    } catch {
      missingPaths.push(candidate);
    }
  }
  if (missingEnvironment.length === 0 && missingPaths.length === 0) return result;
  const missing = [];
  if (missingEnvironment.length > 0) missing.push(`environment variable ${missingEnvironment.join(", ")} is not set`);
  if (missingPaths.length > 0) missing.push(`local path ${missingPaths.join(", ")} is unavailable`);
  return {
    ...result,
    status: "blocked",
    reason: `Rebuild prerequisite missing: ${missing.join("; ")}. Credential values are never read into the report.`,
    rebuild_prerequisite_note: source.rebuild_prerequisites?.note ?? null,
  };
}

async function inspectSource(source, { appRoot, pointerOverrides, environment }) {
  const pointerCandidate = pointerOverrides?.[source.source_key] ?? source.pointer;
  let pointerPath;
  let configPath;
  try {
    pointerPath = await resolveExistingInside(appRoot, pointerCandidate);
    configPath = await resolveExistingInside(appRoot, source.connector_config);
  } catch (error) {
    return blockedResult(source, pointerCandidate, error.message);
  }

  let connectorDocument;
  try {
    connectorDocument = await readJsonDocument(configPath, `${source.source_key} connector configuration`);
  } catch (error) {
    return blockedResult(source, pointerPath, error.message);
  }
  const connector = connectorDocument.value;
  const connectorId = connector.connector_id;
  const connectorVersion = connector.version;
  const connectorConfigSha256 = connectorDocument.sha256;
  if (!connectorId || !connectorVersion) {
    return blockedResult(source, pointerPath, "Connector configuration is missing connector_id or version.", { connectorId });
  }
  try {
    if (compareSemanticVersions(connectorVersion, source.minimum_connector_version) < 0) {
      return blockedResult(source, pointerPath, `Connector configuration ${connectorVersion} is older than migration minimum ${source.minimum_connector_version}.`, { connectorId });
    }
  } catch (error) {
    return blockedResult(source, pointerPath, error.message, { connectorId });
  }

  let pointerDocument;
  try {
    pointerDocument = await readJsonDocument(pointerPath, `${source.source_key} current pointer`);
  } catch (error) {
    return blockedResult(source, pointerPath, error.message, { connectorId });
  }
  const pointer = pointerDocument.value;
  if (pointer.dataset_id !== source.dataset_id || !pointer.release_id || !pointer.manifest) {
    return blockedResult(source, pointerPath, "Current pointer does not identify the expected dataset, release, and manifest.", { connectorId, releaseId: pointer.release_id });
  }
  const pointerSha256 = pointerDocument.sha256;

  let manifestPath;
  try {
    manifestPath = await resolveExistingInside(appRoot, path.resolve(path.dirname(pointerPath), pointer.manifest));
  } catch (error) {
    return blockedResult(source, pointerPath, error.message, { connectorId, releaseId: pointer.release_id });
  }
  let manifestDocument;
  try {
    manifestDocument = await readJsonDocument(manifestPath, `${source.source_key} release manifest`);
  } catch (error) {
    return blockedResult(source, pointerPath, error.message, { connectorId, releaseId: pointer.release_id });
  }
  const manifest = manifestDocument.value;
  if (manifest.dataset_id !== source.dataset_id || manifest.release_id !== pointer.release_id) {
    return blockedResult(source, pointerPath, "Current pointer and release manifest identity do not match.", { connectorId, releaseId: pointer.release_id });
  }
  const manifestSha256 = manifestDocument.sha256;

  const candidate = manifestVersionCandidates(manifest).find((item) => item.id === connectorId);
  const base = {
    source_key: source.source_key,
    dataset_id: source.dataset_id,
    pointer: pointerPath,
    manifest: manifestPath,
    pointer_sha256: pointerSha256,
    manifest_sha256: manifestSha256,
    connector_config_sha256: connectorConfigSha256,
    connector_id: connectorId,
    configured_connector_version: connectorVersion,
    minimum_connector_version: source.minimum_connector_version,
    current_connector_version: candidate?.version ?? null,
    version_evidence: candidate?.location ?? null,
    current_release_id: pointer.release_id,
    build_commands: source.build_commands,
    verify_command: source.verify_command,
  };
  if (!candidate) {
    return applyRebuildPrerequisites({
      ...base,
      status: "rebuild-required",
      reason: `Current manifest has no ${connectorId} version evidence; rebuild and verify the source with the corrected connector.`,
    }, source, environment, appRoot);
  }
  try {
    if (compareSemanticVersions(candidate.version, source.minimum_connector_version) < 0) {
      return applyRebuildPrerequisites({
        ...base,
        status: "rebuild-required",
        reason: `Current release uses ${connectorId}@${candidate.version}; migration requires ${source.minimum_connector_version} or newer.`,
      }, source, environment, appRoot);
    }
  } catch (error) {
    return { ...base, status: "blocked", reason: error.message };
  }
  return {
    ...base,
    status: "ready",
    reason: `Current release records ${connectorId}@${candidate.version}, which satisfies the split ZIP5/ZIP4 migration floor.`,
  };
}

export async function inspectNormalizedUsPostalMigration({
  appRoot = APP_ROOT,
  definition = null,
  definitionPath = DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
  pointerOverrides = {},
  useCandidatePointers = false,
  environment = process.env,
} = {}) {
  const resolvedRoot = path.resolve(appRoot);
  const loadedDefinition = validateDefinition(definition ?? await readJson(await resolveExistingInside(resolvedRoot, definitionPath), "Postal migration definition"));
  const sourceByKey = new Map(loadedDefinition.sources.map((source) => [source.source_key, source]));
  const orderedSources = loadedDefinition.execution_order?.map((key) => sourceByKey.get(key)) ?? loadedDefinition.sources;
  const effectivePointerOverrides = { ...pointerOverrides };
  const pointerScopes = new Map();
  if (useCandidatePointers) {
    if (typeof loadedDefinition.candidate_root !== "string" || loadedDefinition.candidate_root.length === 0) {
      throw new Error("Postal migration definition is missing candidate_root.");
    }
    for (const source of orderedSources) {
      if (Object.hasOwn(effectivePointerOverrides, source.source_key)) continue;
      const candidate = path.join(loadedDefinition.candidate_root, "sources", source.source_key, "current.json");
      try {
        effectivePointerOverrides[source.source_key] = await resolveExistingInside(resolvedRoot, candidate);
        pointerScopes.set(source.source_key, "candidate");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  for (const source of orderedSources) {
    if (!pointerScopes.has(source.source_key)) {
      pointerScopes.set(source.source_key, Object.hasOwn(pointerOverrides, source.source_key) ? "override" : "production");
    }
  }
  const sources = [];
  for (const source of orderedSources) {
    sources.push({
      ...await inspectSource(source, { appRoot: resolvedRoot, pointerOverrides: effectivePointerOverrides, environment }),
      pointer_scope: pointerScopes.get(source.source_key),
    });
  }
  const counts = {
    total: sources.length,
    ready: sources.filter((source) => source.status === "ready").length,
    rebuild_required: sources.filter((source) => source.status === "rebuild-required").length,
    blocked: sources.filter((source) => source.status === "blocked").length,
    candidate_pointers_used: sources.filter((source) => source.pointer_scope === "candidate").length,
  };
  const definitionSha256 = sha256Json(loadedDefinition);
  const frozenInputs = sources.map((source) => ({
    source_key: source.source_key,
    dataset_id: source.dataset_id,
    current_release_id: source.current_release_id,
    pointer_sha256: source.pointer_sha256 ?? null,
    manifest_sha256: source.manifest_sha256 ?? null,
    connector_config_sha256: source.connector_config_sha256 ?? null,
    minimum_connector_version: source.minimum_connector_version,
    pointer_scope: source.pointer_scope,
  }));
  const planSha256 = sha256Json({
    migration_id: loadedDefinition.migration_id,
    contract_version: loadedDefinition.contract_version,
    definition_sha256: definitionSha256,
    frozen_inputs: frozenInputs,
    downstream_order: loadedDefinition.downstream_order ?? [],
  });
  return {
    migration_id: loadedDefinition.migration_id,
    contract_version: loadedDefinition.contract_version,
    definition_sha256: definitionSha256,
    plan_sha256: planSha256,
    ready_for_registry_2_10: counts.ready === counts.total,
    counts,
    frozen_inputs: frozenInputs,
    sources,
    downstream_order: loadedDefinition.downstream_order ?? [],
  };
}

export async function assertNormalizedUsPostalMigrationReady(options = {}) {
  const report = await inspectNormalizedUsPostalMigration(options);
  if (report.ready_for_registry_2_10) return report;
  const failures = report.sources.filter((source) => source.status !== "ready");
  const preview = failures.slice(0, 4).map((source) => `${source.source_key}: ${source.reason}`).join("; ");
  const error = new Error(`Registry 2.10 preflight rejected ${failures.length} source release(s): ${preview}. Run npm run postal-migration:status for the complete ordered rebuild plan.`);
  error.code = "ERR_NORMALIZED_US_POSTAL_MIGRATION_REQUIRED";
  error.report = report;
  throw error;
}

function displayPath(filePath, appRoot) {
  if (!filePath) return "—";
  if (path.isAbsolute(filePath) && path.resolve(appRoot) === path.resolve(APP_ROOT)) return relativeToApp(filePath);
  if (path.isAbsolute(filePath)) return path.relative(appRoot, filePath).replaceAll("\\", "/");
  return filePath.replaceAll("\\", "/");
}

export function formatNormalizedUsPostalMigrationReport(report, { appRoot = APP_ROOT } = {}) {
  const lines = [
    `Normalized U.S. postal migration: ${report.migration_id}`,
    `Ready for registry 2.10: ${report.ready_for_registry_2_10 ? "yes" : "no"}`,
    `Sources: ${report.counts.ready}/${report.counts.total} ready; ${report.counts.rebuild_required} rebuild required; ${report.counts.blocked} blocked`,
    `Pointer scope: ${report.counts.candidate_pointers_used} isolated candidate; ${report.counts.total - report.counts.candidate_pointers_used} production or explicit override`,
    `Frozen-plan SHA-256: ${report.plan_sha256}`,
    "",
  ];
  for (const source of report.sources) {
    const version = source.current_connector_version ? `${source.current_connector_version} -> ${source.minimum_connector_version}` : `unknown -> ${source.minimum_connector_version}`;
    lines.push(`[${source.status}] ${source.source_key} (${version}; ${source.pointer_scope})`);
    lines.push(`  pointer: ${displayPath(source.pointer, appRoot)}`);
    lines.push(`  reason: ${source.reason}`);
    if (source.status !== "ready") {
      for (const command of source.build_commands) lines.push(`  build: ${command}`);
      lines.push(`  verify: ${source.verify_command}`);
    }
  }
  if (report.downstream_order.length > 0) {
    lines.push("", "Downstream order after every source is ready:");
    for (const command of report.downstream_order) lines.push(`  ${command}`);
  }
  return `${lines.join("\n")}\n`;
}
