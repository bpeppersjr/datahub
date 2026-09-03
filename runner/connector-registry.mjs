import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONNECTOR_REGISTRY_VERSION = "1.0.0";
export const CANONICAL_CONNECTOR_LIFECYCLE = Object.freeze([
  "preflight",
  "plan",
  "acquire",
  "validate",
  "normalize",
  "reconcile",
  "quality gate",
  "publish",
  "finalize",
]);

const CONTRACT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONNECTOR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const REQUIRED_MANIFEST_STRINGS = [
  "connector_id",
  "version",
  "description",
  "redirect_policy",
  "provider_budget_key",
  "resource_class",
  "retry",
  "checkpoint",
  "idempotency",
  "cancellation",
  "source_policy",
  "retention_profile",
];
const REQUIRED_MANIFEST_ARRAYS = [
  "lifecycle",
  "named_secret_references",
  "input_artifact_types",
  "output_artifact_types",
  "allowed_hosts",
  "produced_entities",
  "produced_identifiers",
];
const REQUIRED_POLICY_FIELDS = [
  "policy_id",
  "version",
  "ownership",
  "allowed_use",
  "prohibited_use",
  "attribution",
  "retention",
  "redistribution",
];

function clone(value) {
  return structuredClone(value);
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function error(pathValue, code, message) {
  return { path: pathValue, code, message };
}

function stringArrayErrors(value, pathValue, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) return [error(pathValue, "type", "must be an array")];
  const failures = [];
  if (!allowEmpty && !value.length) failures.push(error(pathValue, "minimum", "must not be empty"));
  const seen = new Set();
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) failures.push(error(`${pathValue}[${index}]`, "type", "must be a non-empty string"));
    else if (seen.has(item)) failures.push(error(`${pathValue}[${index}]`, "duplicate", `duplicates ${item}`));
    else seen.add(item);
  });
  return failures;
}

function validateLifecycle(value, pathValue) {
  const failures = stringArrayErrors(value, pathValue);
  if (failures.length) return failures;
  let previous = -1;
  for (const stage of CANONICAL_CONNECTOR_LIFECYCLE) {
    const index = value.indexOf(stage);
    if (index < 0) failures.push(error(pathValue, "lifecycle-stage", `is missing canonical stage ${stage}`));
    else if (index <= previous) failures.push(error(pathValue, "lifecycle-order", `places ${stage} outside canonical order`));
    previous = Math.max(previous, index);
  }
  if (value[0] !== "preflight" || value.at(-1) !== "finalize") {
    failures.push(error(pathValue, "lifecycle-boundary", "must start with preflight and end with finalize"));
  }
  return failures;
}

function validateSecretReferences(value, pathValue) {
  if (!Array.isArray(value)) return [error(pathValue, "type", "must be an array")];
  const failures = [];
  const names = new Set();
  value.forEach((item, index) => {
    const name = typeof item === "string" ? item : item?.name;
    if (!SECRET_NAME.test(String(name ?? ""))) failures.push(error(`${pathValue}[${index}]`, "secret-name", "must name an uppercase environment-style secret reference"));
    else if (names.has(name)) failures.push(error(`${pathValue}[${index}]`, "duplicate", `duplicates ${name}`));
    else names.add(name);
    if (isPlainObject(item) && "value" in item) failures.push(error(`${pathValue}[${index}].value`, "secret-value", "must never contain a secret value"));
  });
  return failures;
}

function validateSchemaDefinition(schema, pathValue = "configuration_schema") {
  if (!isPlainObject(schema)) return [error(pathValue, "type", "must be an object")];
  const failures = [];
  if (schema.type !== "object") failures.push(error(`${pathValue}.type`, "schema-root", "must be object"));
  if (schema.additionalProperties !== false) failures.push(error(`${pathValue}.additionalProperties`, "schema-closed", "must be false"));
  if (!isPlainObject(schema.properties)) failures.push(error(`${pathValue}.properties`, "type", "must be an object"));
  if (schema.required !== undefined) {
    failures.push(...stringArrayErrors(schema.required, `${pathValue}.required`, { allowEmpty: true }));
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(schema.properties ?? {}, name)) failures.push(error(`${pathValue}.required`, "unknown-required", `references unknown property ${name}`));
    }
  }
  return failures;
}

function normalizedTypes(value) {
  return Array.isArray(value) ? value : [value];
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateValue(value, schema, pathValue, failures) {
  if (Object.hasOwn(schema, "const")) {
    if (!Object.is(value, schema.const)) failures.push(error(pathValue, "const", "must equal the connector-declared constant"));
    return;
  }
  const types = normalizedTypes(schema.type);
  if (!types.some((type) => matchesType(value, type))) {
    failures.push(error(pathValue, "type", `must be ${types.join(" or ")}`));
    return;
  }
  if (value === null) return;
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) failures.push(error(pathValue, "enum", "must be one of the declared values"));
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) failures.push(error(pathValue, "minimum", `must be at least ${schema.minimum}`));
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) failures.push(error(pathValue, "exclusiveMinimum", `must be greater than ${schema.exclusiveMinimum}`));
    if (schema.maximum !== undefined && value > schema.maximum) failures.push(error(pathValue, "maximum", `must be at most ${schema.maximum}`));
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) failures.push(error(pathValue, "minLength", `must contain at least ${schema.minLength} characters`));
    if (schema.maxLength !== undefined && value.length > schema.maxLength) failures.push(error(pathValue, "maxLength", `must contain at most ${schema.maxLength} characters`));
    if (schema.pattern) {
      try {
        if (!(new RegExp(schema.pattern).test(value))) failures.push(error(pathValue, "pattern", "does not match the required pattern"));
      } catch {
        failures.push(error(pathValue, "schema-pattern", "declares an invalid regular expression"));
      }
    }
    if (schema.format === "date") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const instant = match ? new Date(`${value}T00:00:00.000Z`) : null;
      if (!match || Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) failures.push(error(pathValue, "format", "must be a valid YYYY-MM-DD date"));
    }
  }
  if (isPlainObject(value) && schema.type === "object") validateObject(value, schema, pathValue, failures);
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => validateValue(item, schema.items, `${pathValue}[${index}]`, failures));
}

function validateObject(input, schema, pathValue, failures, applyDefaults = false) {
  const properties = schema.properties ?? {};
  for (const required of schema.required ?? []) {
    if (!Object.hasOwn(input, required)) failures.push(error(`${pathValue}.${required}`, "required", "is required"));
  }
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (!Object.hasOwn(input, name) && applyDefaults && Object.hasOwn(propertySchema, "default")) input[name] = clone(propertySchema.default);
    if (Object.hasOwn(input, name)) validateValue(input[name], propertySchema, `${pathValue}.${name}`, failures);
  }
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(input)) {
      if (!Object.hasOwn(properties, name)) failures.push(error(`${pathValue}.${name}`, "additional-property", "is not declared by this connector"));
    }
  }
}

export function validateConnectorConfiguration(manifest, input, { applyDefaults = true } = {}) {
  const configuration = isPlainObject(input) ? clone(input) : input;
  const failures = [];
  if (!isPlainObject(configuration)) {
    failures.push(error("configuration", "type", "must be an object"));
    return { valid: false, errors: failures, configuration: null };
  }
  validateObject(configuration, manifest.configuration_schema, "configuration", failures, applyDefaults);
  return { valid: failures.length === 0, errors: failures, configuration };
}

function safePolicyPath(root, value) {
  if (typeof value !== "string" || !/^config\/source-policies\/[a-z0-9-]+\.json$/.test(value)) return null;
  const absolute = path.resolve(root, value);
  const policyRoot = path.resolve(root, "config", "source-policies");
  const relative = path.relative(policyRoot, absolute);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : absolute;
}

async function readJsonFile(filename, label) {
  const buffer = await readFile(filename);
  try {
    return { value: JSON.parse(buffer.toString("utf8")), buffer };
  } catch (caught) {
    throw new Error(`${label} is not valid JSON: ${caught.message}`);
  }
}

function validateManifest(manifest, filename) {
  if (!isPlainObject(manifest)) return [error(filename, "type", "connector manifest must be an object")];
  const failures = [];
  for (const field of REQUIRED_MANIFEST_STRINGS) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) failures.push(error(`${filename}:${field}`, "required", "must be a non-empty string"));
  }
  for (const field of REQUIRED_MANIFEST_ARRAYS) {
    if (field === "lifecycle") failures.push(...validateLifecycle(manifest[field], `${filename}:${field}`));
    else if (field === "named_secret_references") failures.push(...validateSecretReferences(manifest[field], `${filename}:${field}`));
    else failures.push(...stringArrayErrors(manifest[field], `${filename}:${field}`, { allowEmpty: ["input_artifact_types", "allowed_hosts"].includes(field) }));
  }
  if (!CONNECTOR_ID.test(manifest.connector_id ?? "")) failures.push(error(`${filename}:connector_id`, "format", "must be a lowercase kebab-case identifier"));
  if (path.basename(filename, ".json") !== manifest.connector_id) failures.push(error(`${filename}:connector_id`, "filename", "must match the manifest filename"));
  if (!SEMVER.test(manifest.version ?? "")) failures.push(error(`${filename}:version`, "format", "must be semantic version x.y.z"));
  if (!isPlainObject(manifest.execution_limits)) failures.push(error(`${filename}:execution_limits`, "type", "must be an object"));
  failures.push(...validateSchemaDefinition(manifest.configuration_schema, `${filename}:configuration_schema`));
  for (const [index, host] of (manifest.allowed_hosts ?? []).entries()) {
    if (host !== host.toLowerCase() || host.includes("://") || host.includes("/") || !/^[a-z0-9.-]+$/.test(host)) failures.push(error(`${filename}:allowed_hosts[${index}]`, "hostname", "must be a lowercase hostname without a scheme or path"));
  }
  if (isPlainObject(manifest.configuration_schema)) {
    const defaults = validateConnectorConfiguration(manifest, {}, { applyDefaults: true });
    const missingOnly = defaults.errors.filter((failure) => failure.code === "required");
    const invalidDefaults = defaults.errors.filter((failure) => failure.code !== "required");
    if (invalidDefaults.length) failures.push(...invalidDefaults.map((failure) => ({ ...failure, path: `${filename}:${failure.path}` })));
    manifest.configuration_defaults = defaults.configuration;
    manifest.required_configuration = missingOnly.map((failure) => failure.path.replace("configuration.", ""));
  }
  return failures;
}

function validatePolicy(policy, filename) {
  if (!isPlainObject(policy)) return [error(filename, "type", "source policy must be an object")];
  const failures = [];
  for (const field of REQUIRED_POLICY_FIELDS) {
    const value = policy[field];
    if (["allowed_use", "prohibited_use"].includes(field)) failures.push(...stringArrayErrors(value, `${filename}:${field}`));
    else if (typeof value !== "string" || !value.trim()) failures.push(error(`${filename}:${field}`, "required", "must be a non-empty string"));
  }
  if (!CONNECTOR_ID.test(policy.policy_id ?? "")) failures.push(error(`${filename}:policy_id`, "format", "must be a lowercase kebab-case identifier"));
  if (!SEMVER.test(policy.version ?? "")) failures.push(error(`${filename}:version`, "format", "must be semantic version x.y.z"));
  return failures;
}

function publicEntry(entry) {
  return {
    connector_id: entry.manifest.connector_id,
    version: entry.manifest.version,
    description: entry.manifest.description,
    implementation_status: entry.manifest.implementation_status ?? "unspecified",
    lifecycle: clone(entry.manifest.lifecycle),
    configuration_schema: clone(entry.manifest.configuration_schema),
    configuration_defaults: clone(entry.manifest.configuration_defaults),
    required_configuration: clone(entry.manifest.required_configuration),
    named_secret_references: entry.manifest.named_secret_references.map((item) => typeof item === "string" ? { name: item } : { name: item.name, purpose: item.purpose ?? null, storage: item.storage ?? null }),
    input_artifact_types: clone(entry.manifest.input_artifact_types),
    output_artifact_types: clone(entry.manifest.output_artifact_types),
    allowed_hosts: clone(entry.manifest.allowed_hosts),
    redirect_policy: entry.manifest.redirect_policy,
    provider_budget_key: entry.manifest.provider_budget_key,
    resource_class: entry.manifest.resource_class,
    source_policy: {
      path: entry.manifest.source_policy,
      policy_id: entry.policy.policy_id,
      version: entry.policy.version,
      redistribution: entry.policy.redistribution,
      export_policy: entry.policy.export_policy ?? null,
      sha256: entry.policySha256,
    },
    retention_profile: entry.manifest.retention_profile,
    produced_entities: clone(entry.manifest.produced_entities),
    produced_identifiers: clone(entry.manifest.produced_identifiers),
    manifest_sha256: entry.manifestSha256,
  };
}

export async function createConnectorRegistry({ root = CONTRACT_ROOT } = {}) {
  const connectorDirectory = path.join(root, "config", "connectors");
  const files = (await readdir(connectorDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) throw new Error("Connector registry contains no manifests.");
  const entries = [];
  const failures = [];
  const ids = new Set();
  const policyFiles = new Set();

  for (const file of files) {
    const manifestPath = path.join(connectorDirectory, file);
    let manifestDocument;
    try {
      manifestDocument = await readJsonFile(manifestPath, `Connector manifest ${file}`);
    } catch (caught) {
      failures.push(error(file, "json", caught.message));
      continue;
    }
    const manifest = manifestDocument.value;
    failures.push(...validateManifest(manifest, file));
    if (ids.has(manifest.connector_id)) failures.push(error(`${file}:connector_id`, "duplicate", `duplicates ${manifest.connector_id}`));
    ids.add(manifest.connector_id);

    const policyPath = safePolicyPath(root, manifest.source_policy);
    if (!policyPath) {
      failures.push(error(`${file}:source_policy`, "path", "must reference one exact config/source-policies/*.json file"));
      continue;
    }
    let policyDocument;
    try {
      policyDocument = await readJsonFile(policyPath, `Source policy ${manifest.source_policy}`);
    } catch (caught) {
      failures.push(error(`${file}:source_policy`, "read", caught.message));
      continue;
    }
    failures.push(...validatePolicy(policyDocument.value, manifest.source_policy));
    policyFiles.add(manifest.source_policy);
    entries.push({
      manifest,
      policy: policyDocument.value,
      manifestSha256: digest(manifestDocument.buffer),
      policySha256: digest(policyDocument.buffer),
    });
  }

  if (failures.length) {
    const registryError = new Error(`Connector registry validation failed with ${failures.length} issue(s).`);
    registryError.name = "ConnectorRegistryValidationError";
    registryError.failures = failures;
    throw registryError;
  }

  entries.sort((left, right) => left.manifest.connector_id.localeCompare(right.manifest.connector_id));
  const byId = new Map(entries.map((entry) => [entry.manifest.connector_id, entry]));
  const summaries = entries.map(publicEntry);
  return Object.freeze({
    version: CONNECTOR_REGISTRY_VERSION,
    connectorCount: entries.length,
    policyProfileCount: policyFiles.size,
    list() {
      return clone(summaries);
    },
    get(connectorId) {
      const entry = byId.get(connectorId);
      return entry ? clone(publicEntry(entry)) : null;
    },
    validateConfiguration(connectorId, input, options) {
      const entry = byId.get(connectorId);
      if (!entry) return { valid: false, errors: [error("connector_id", "unknown", `Unknown connector ${connectorId}.`)], configuration: null };
      return validateConnectorConfiguration(entry.manifest, input, options);
    },
  });
}
