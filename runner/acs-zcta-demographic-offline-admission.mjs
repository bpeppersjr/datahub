import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import {
  TABLES,
  expectedDemographicCells,
  validateAcsZctaDemographicCandidateRow,
} from "./acs-zcta-demographic-admission.mjs";
import { mnSelectionCanonical as canonical } from "./mn-construction-retained-selection.mjs";

export const VERSION = "acs-zcta-demographic-offline-release@1.0.0";
const SHA = /^[a-f0-9]{64}$/;
const FILES = [
  "authorization.json",
  "data.jsonl",
  "manifest.json",
  "metadata.json",
];
const fail = (m) => {
  throw Error(`ACS ZCTA offline admission rejected: ${m}.`);
};
const check = (v, m) => v || fail(m);
const exact = (v, k) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...k].sort());
const text = (v, max) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(v);
const hash = (v) => createHash("sha256").update(v).digest("hex");
const stable = (a, b) =>
  a.isFile() &&
  b.isFile() &&
  !a.isSymbolicLink() &&
  !b.isSymbolicLink() &&
  a.nlink === 1n &&
  b.nlink === 1n &&
  ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((k) => a[k] === b[k]);
const checkpoint = (s) => s?.throwIfAborted();
async function secureRead(file, max, signal) {
  checkpoint(signal);
  const before = await fs.lstat(file, { bigint: true });
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size <= BigInt(max),
    "unsafe or oversized input",
  );
  const h = await fs.open(file, "r"),
    chunks = [],
    digest = createHash("sha256");
  let bytes = 0;
  try {
    check(
      stable(before, await h.stat({ bigint: true })),
      "input ownership changed",
    );
    for (;;) {
      checkpoint(signal);
      const b = Buffer.alloc(65536),
        r = await h.read(b, 0, b.length, null);
      if (!r.bytesRead) break;
      bytes += r.bytesRead;
      check(bytes <= max, "input byte ceiling");
      const p = b.subarray(0, r.bytesRead);
      chunks.push(p);
      digest.update(p);
    }
    check(
      stable(before, await h.stat({ bigint: true })) &&
        stable(before, await fs.lstat(file, { bigint: true })),
      "input changed during read",
    );
    return { raw: Buffer.concat(chunks), bytes, sha256: digest.digest("hex") };
  } finally {
    await h.close();
  }
}
const decode = (r) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(r.raw));

export function validateOfficialMetadata(value, config) {
  check(
    exact(value, [
      "schema_version",
      "publisher",
      "dataset",
      "vintage",
      "geography",
      "groups",
      "sentinels",
    ]) &&
      value.schema_version === "acs-zcta-official-metadata@1.0.0" &&
      value.publisher === "United States Census Bureau" &&
      value.dataset === "acs/acs5" &&
      Number.isSafeInteger(value.vintage) &&
      value.vintage >= 2009 &&
      value.vintage <= 2100 &&
      value.geography === "zip code tabulation area",
    "metadata envelope",
  );
  check(exact(value.groups, TABLES), "metadata groups");
  for (const group of TABLES) {
    const g = value.groups[group],
      vars = expectedDemographicCells(config);
    check(
      exact(g, ["concept", "universe", "variables"]) &&
        text(g.concept, 1000) &&
        text(g.universe, 1000) &&
        g.variables &&
        typeof g.variables === "object" &&
        !Array.isArray(g.variables),
      "metadata group",
    );
    const expected = vars.filter((v) => v.startsWith(group));
    check(
      JSON.stringify(Object.keys(g.variables).sort()) ===
        JSON.stringify(expected.sort()),
      `${group} metadata roster`,
    );
    for (const base of expected) {
      const v = g.variables[base];
      check(
        exact(v, [
          "label",
          "estimate",
          "margin_of_error",
          "estimate_annotation",
          "margin_of_error_annotation",
        ]) &&
          text(v.label, 1000) &&
          v.estimate === `${base}E` &&
          v.margin_of_error === `${base}M` &&
          v.estimate_annotation === `${base}EA` &&
          v.margin_of_error_annotation === `${base}MA`,
        `${base} metadata`,
      );
    }
  }
  check(
    Array.isArray(value.sentinels) &&
      value.sentinels.length <= 32 &&
      value.sentinels.every(
        (v) =>
          exact(v, ["value", "meaning"]) &&
          /^-\d{1,18}$/.test(v.value) &&
          text(v.meaning, 1000),
      ),
    "sentinel metadata",
  );
  return value;
}
export function validateAuthorization(value) {
  check(
    exact(value, [
      "schema_version",
      "authorization_id",
      "authorized_at",
      "authorized_by",
      "source_files_supplied_offline",
      "network_acquisition_authorized",
      "production_enrollment_authorized",
      "current_pointer_change_authorized",
    ]) &&
      value.schema_version === "acs-zcta-offline-authorization@1.0.0" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.authorization_id) &&
      new Date(value.authorized_at).toISOString() === value.authorized_at &&
      text(value.authorized_by, 128) &&
      value.source_files_supplied_offline === true &&
      value.network_acquisition_authorized === false &&
      value.production_enrollment_authorized === false &&
      value.current_pointer_change_authorized === false,
    "authorization",
  );
  return value;
}
export function validateOfflinePackageManifest(value) {
  check(
    exact(value, [
      "schema_version",
      "dataset",
      "vintage",
      "geography",
      "record_count",
      "artifacts",
    ]) &&
      value.schema_version === "acs-zcta-offline-package@1.0.0" &&
      value.dataset === "acs/acs5" &&
      Number.isSafeInteger(value.vintage) &&
      value.geography === "zip code tabulation area" &&
      value.record_count === 33791 &&
      Array.isArray(value.artifacts) &&
      value.artifacts.length === 3,
    "package manifest",
  );
  const names = ["authorization.json", "data.jsonl", "metadata.json"];
  check(
    JSON.stringify(value.artifacts.map((v) => v.path).sort()) ===
      JSON.stringify(names),
    "package inventory",
  );
  for (const a of value.artifacts)
    check(
      exact(a, ["path", "bytes", "sha256"]) &&
        names.includes(a.path) &&
        Number.isSafeInteger(a.bytes) &&
        a.bytes > 0 &&
        SHA.test(a.sha256),
      "package artifact",
    );
  return value;
}
function validateRegistries(metadataRegistry, authorizationRegistry) {
  check(
    exact(metadataRegistry, [
      "schema_version",
      "status",
      "supported_releases",
    ]) &&
      metadataRegistry.schema_version ===
        "acs-zcta-demographic-official-metadata-registry@1.0.0" &&
      text(metadataRegistry.status, 128) &&
      Array.isArray(metadataRegistry.supported_releases),
    "metadata registry",
  );
  check(
    exact(authorizationRegistry, [
      "schema_version",
      "status",
      "approved_receipts",
    ]) &&
      authorizationRegistry.schema_version ===
        "acs-zcta-demographic-authorization-registry@1.0.0" &&
      text(authorizationRegistry.status, 128) &&
      Array.isArray(authorizationRegistry.approved_receipts),
    "authorization registry",
  );
}

async function copyBounded(source, target, max, signal) {
  checkpoint(signal);
  await canonical(path.dirname(source), { signal });
  const before = await fs.lstat(source, { bigint: true });
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size <= BigInt(max),
    "unsafe or oversized input",
  );
  const input = await fs.open(source, "r"),
    output = await fs.open(target, "wx"),
    digest = createHash("sha256"),
    chunks = max <= 2_000_000 ? [] : null;
  let bytes = 0;
  try {
    check(
      stable(before, await input.stat({ bigint: true })),
      "input ownership changed",
    );
    for (;;) {
      checkpoint(signal);
      const buffer = Buffer.alloc(65536),
        r = await input.read(buffer, 0, buffer.length, null);
      if (!r.bytesRead) break;
      bytes += r.bytesRead;
      check(bytes <= max, "input byte ceiling");
      const part = buffer.subarray(0, r.bytesRead);
      chunks?.push(part);
      digest.update(part);
      await output.write(part);
    }
    await output.sync();
    check(
      stable(before, await input.stat({ bigint: true })) &&
        stable(before, await fs.lstat(source, { bigint: true })),
      "input changed during copy",
    );
    return {
      raw: chunks ? Buffer.concat(chunks) : undefined,
      bytes,
      sha256: digest.digest("hex"),
    };
  } finally {
    await Promise.allSettled([input.close(), output.close()]);
  }
}
async function governedZctas(root, config, signal) {
  const manifestRead = await secureRead(
    assertInsideApp(path.resolve(root, config.geography.manifest)),
    500000,
    signal,
  );
  check(
    manifestRead.sha256 === config.geography.manifest_sha256,
    "geography manifest pin",
  );
  const manifest = decode(manifestRead),
    artifact = manifest.artifacts?.find(
      (v) => v.path === config.geography.artifact,
    );
  check(
    manifest.release_id === config.geography.release_id &&
      artifact?.sha256 === config.geography.artifact_sha256 &&
      artifact.record_count === 33791,
    "geography binding",
  );
  const file = assertInsideApp(
      path.join(
        path.dirname(path.resolve(root, config.geography.manifest)),
        artifact.path,
      ),
    ),
    read = await secureRead(file, 20000000, signal);
  check(
    read.sha256 === artifact.sha256 && read.bytes === artifact.bytes,
    "geography artifact",
  );
  const set = new Set();
  for (const line of new TextDecoder("utf-8", { fatal: true })
    .decode(read.raw)
    .split("\n"))
    if (line) {
      checkpoint(signal);
      const row = JSON.parse(line);
      check(
        /^\d{5}$/.test(row.zcta) &&
          row.geoid === row.zcta &&
          row.geo_type === "zcta" &&
          !set.has(row.zcta),
        "geography row",
      );
      set.add(row.zcta);
    }
  check(set.size === 33791, "geography conservation");
  return set;
}
async function scanData(file, config, metadata, governed, signal) {
  await canonical(path.dirname(file), { signal });
  const before = await fs.lstat(file, { bigint: true });
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size <= 1500000000n,
    "unsafe data input",
  );
  const seen = new Set(),
    digest = createHash("sha256"),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    rows = 0,
    tail = "";
  const stream = createReadStream(file);
  signal?.addEventListener("abort", () => stream.destroy(signal.reason), {
    once: true,
  });
  for await (const chunk of stream) {
    checkpoint(signal);
    bytes += chunk.length;
    check(bytes <= 1_500_000_000, "data byte ceiling");
    digest.update(chunk);
    tail += decoder.decode(chunk, { stream: true });
    for (;;) {
      const newline = tail.indexOf("\n");
      if (newline < 0) break;
      const line = tail.slice(0, newline);
      tail = tail.slice(newline + 1);
      check(
        line.length > 0 &&
          !line.endsWith("\r") &&
          Buffer.byteLength(line) <= 262144,
        "data line framing",
      );
      const row = validateAcsZctaDemographicCandidateRow(
        JSON.parse(line),
        config,
      );
      check(
        governed.has(row.zcta) && !seen.has(row.zcta),
        "duplicate or ungoverned ZCTA",
      );
      seen.add(row.zcta);
      rows++;
      check(rows <= 33791, "row ceiling");
    }
  }
  tail += decoder.decode();
  check(
    tail.length === 0,
    "data must be UTF-8 JSONL with one LF-terminated record per line",
  );
  check(
    bytes === Number(before.size) &&
      stable(before, await fs.lstat(file, { bigint: true })),
    "data changed during read",
  );
  check(
    rows === 33791 && seen.size === governed.size,
    "exact ZCTA conservation",
  );
  return {
    bytes,
    sha256: digest.digest("hex"),
    rows,
    vintage: metadata.vintage,
  };
}

export async function admitOfflineAcsZctaPackage(options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT),
    operationId = options.operationId;
  check(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId ?? ""),
    "operation id",
  );
  checkpoint(options.signal);
  const source = assertInsideApp(
      path.resolve(root, options.packageDirectory ?? ""),
    ),
    allowed = path.join(root, "data", "imports"),
    sourceStat = await fs.lstat(source);
  check(
    sourceStat.isDirectory() && !sourceStat.isSymbolicLink(),
    "package directory identity",
  );
  const allowedReal = await fs.realpath(allowed),
    sourceReal = await fs.realpath(source),
    realRelative = path.relative(allowedReal, sourceReal);
  check(
    realRelative &&
      !realRelative.startsWith("..") &&
      !path.isAbsolute(realRelative),
    "package must be below data/imports",
  );
  const names = (await fs.readdir(source)).sort();
  check(
    JSON.stringify(names) === JSON.stringify(FILES),
    "closed package directory",
  );
  const operation = assertInsideApp(
    path.resolve(
      options.operationDirectory ??
        path.join(root, "data/managed-operations", operationId),
    ),
  );
  check(
    operation === path.join(root, "data/managed-operations", operationId),
    "operation directory binding",
  );
  const input = path.join(operation, "input"),
    stagingRoot = path.join(root, "data/acs-zcta-demographics/.staging"),
    releaseRoot = path.join(root, "data/acs-zcta-demographics/releases"),
    stage = path.join(stagingRoot, randomUUID());
  await canonical(operation, { signal: options.signal });
  await fs.mkdir(input, { recursive: false });
  await fs.mkdir(stagingRoot, { recursive: true });
  await fs.mkdir(releaseRoot, { recursive: true });
  await canonical(stagingRoot, { signal: options.signal });
  await canonical(releaseRoot, { signal: options.signal });
  await fs.mkdir(stage, { recursive: false });
  try {
    const limits = {
        "manifest.json": 200000,
        "metadata.json": 2000000,
        "authorization.json": 100000,
        "data.jsonl": 1500000000,
      },
      copied = {};
    for (const name of FILES) {
      checkpoint(options.signal);
      copied[name] = await copyBounded(
        path.join(source, name),
        path.join(input, name),
        limits[name],
        options.signal,
      );
    }
    const manifest = validateOfflinePackageManifest(
      decode(copied["manifest.json"]),
    );
    for (const a of manifest.artifacts)
      check(
        copied[a.path].bytes === a.bytes && copied[a.path].sha256 === a.sha256,
        `${a.path} package hash`,
      );
    const config = JSON.parse(
        await fs.readFile(
          path.join(root, "config/acs-zcta-demographic-admission.json"),
          "utf8",
        ),
      ),
      metadata = validateOfficialMetadata(
        decode(copied["metadata.json"]),
        config,
      ),
      authorization = validateAuthorization(
        decode(copied["authorization.json"]),
      );
    check(metadata.vintage === manifest.vintage, "metadata vintage");
    const metadataRegistryRead = await secureRead(
        assertInsideApp(
          path.resolve(root, config.official_metadata_registry.path),
        ),
        500000,
        options.signal,
      ),
      authorizationRegistryRead = await secureRead(
        assertInsideApp(path.resolve(root, config.authorization_registry.path)),
        500000,
        options.signal,
      ),
      policyRead = await secureRead(
        assertInsideApp(path.resolve(root, config.source_policy.path)),
        200000,
        options.signal,
      );
    check(
      metadataRegistryRead.sha256 ===
        config.official_metadata_registry.sha256 &&
        authorizationRegistryRead.sha256 ===
          config.authorization_registry.sha256 &&
        policyRead.sha256 === config.source_policy.sha256,
      "registry or policy pins",
    );
    const metadataRegistry = decode(metadataRegistryRead),
      authorizationRegistry = decode(authorizationRegistryRead);
    validateRegistries(metadataRegistry, authorizationRegistry);
    const supported = metadataRegistry.supported_releases.find(
        (v) =>
          v?.vintage === manifest.vintage &&
          v?.dataset === manifest.dataset &&
          v?.metadata_sha256 === copied["metadata.json"].sha256,
      ),
      approved = authorizationRegistry.approved_receipts.find(
        (v) =>
          v?.authorization_id === authorization.authorization_id &&
          v?.authorization_sha256 === copied["authorization.json"].sha256 &&
          v?.metadata_sha256 === copied["metadata.json"].sha256 &&
          v?.data_sha256 === copied["data.jsonl"].sha256 &&
          v?.vintage === manifest.vintage,
      );
    check(supported, "metadata is not in the pinned official registry");
    check(approved, "authorization is not in the pinned approval registry");
    const governed = await governedZctas(root, config, options.signal),
      data = await scanData(
        path.join(input, "data.jsonl"),
        config,
        metadata,
        governed,
        options.signal,
      );
    check(
      data.bytes === copied["data.jsonl"].bytes &&
        data.sha256 === copied["data.jsonl"].sha256,
      "data replay",
    );
    const body = {
      schema_version: VERSION,
      status: "immutable-local-review-only",
      publication_mode: "pointer-free",
      created_at: new Date().toISOString(),
      operation_id: operationId,
      source: {
        dataset: manifest.dataset,
        vintage: manifest.vintage,
        geography: manifest.geography,
        source_policy_sha256: policyRead.sha256,
        package_manifest_sha256: copied["manifest.json"].sha256,
        authorization_sha256: copied["authorization.json"].sha256,
        metadata_sha256: copied["metadata.json"].sha256,
        data_sha256: data.sha256,
        record_count: data.rows,
      },
      availability: { race: true, ancestry: true, sex: true, age: true },
      claims: {
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
        percentages_emitted: false,
        official_usps_zip: false,
      },
      artifacts: [
        {
          path: "data.jsonl",
          bytes: data.bytes,
          sha256: data.sha256,
          record_count: data.rows,
        },
        {
          path: "metadata.json",
          bytes: copied["metadata.json"].bytes,
          sha256: copied["metadata.json"].sha256,
        },
        {
          path: "authorization.json",
          bytes: copied["authorization.json"].bytes,
          sha256: copied["authorization.json"].sha256,
        },
        {
          path: "package-manifest.json",
          bytes: copied["manifest.json"].bytes,
          sha256: copied["manifest.json"].sha256,
        },
      ],
    };
    const release = {
      release_id: `acs-zcta-demographics-${hash(JSON.stringify(body))}`,
      ...body,
    };
    for (const a of release.artifacts) {
      const sourceName =
        a.path === "package-manifest.json" ? "manifest.json" : a.path;
      await fs.copyFile(
        path.join(input, sourceName),
        path.join(stage, a.path),
        constants.COPYFILE_EXCL,
      );
    }
    await fs.writeFile(
      path.join(stage, "manifest.json"),
      `${JSON.stringify(release)}\n`,
      { flag: "wx" },
    );
    checkpoint(options.signal);
    const target = path.join(
      root,
      "data/acs-zcta-demographics/releases",
      release.release_id,
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    await canonical(path.dirname(target), { signal: options.signal });
    await fs.rename(stage, target);
    return {
      release_id: release.release_id,
      manifest: path.join(target, "manifest.json"),
      manifest_sha256: hash(Buffer.from(`${JSON.stringify(release)}\n`)),
      record_count: data.rows,
      network_requests: 0,
      current_pointer_written: false,
      production_enrollment: false,
    };
  } catch (e) {
    await fs.rm(stage, { recursive: true, force: true });
    throw e;
  }
}

export async function verifyOfflineAcsZctaRelease(manifestPath, options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT),
    resolved = assertInsideApp(path.resolve(root, manifestPath));
  await canonical(path.dirname(resolved), { signal: options.signal });
  const read = await secureRead(resolved, 200000, options.signal),
    m = decode(read);
  check(
    exact(m, [
      "release_id",
      "schema_version",
      "status",
      "publication_mode",
      "created_at",
      "operation_id",
      "source",
      "availability",
      "claims",
      "artifacts",
    ]) &&
      m.schema_version === VERSION &&
      m.status === "immutable-local-review-only" &&
      m.publication_mode === "pointer-free" &&
      new Date(m.created_at).toISOString() === m.created_at &&
      exact(m.source, [
        "dataset",
        "vintage",
        "geography",
        "source_policy_sha256",
        "package_manifest_sha256",
        "authorization_sha256",
        "metadata_sha256",
        "data_sha256",
        "record_count",
      ]) &&
      exact(m.availability, ["race", "ancestry", "sex", "age"]) &&
      Object.values(m.availability).every((v) => v === true) &&
      exact(m.claims, [
        "network_requests",
        "current_pointer_written",
        "production_enrollment",
        "percentages_emitted",
        "official_usps_zip",
      ]) &&
      m.claims.network_requests === 0 &&
      m.claims.current_pointer_written === false &&
      m.claims.production_enrollment === false &&
      m.claims.percentages_emitted === false &&
      m.claims.official_usps_zip === false,
    "release manifest",
  );
  const { release_id, ...body } = m;
  check(
    release_id === `acs-zcta-demographics-${hash(JSON.stringify(body))}`,
    "release identity",
  );
  const dir = path.dirname(resolved);
  check(
    dir ===
      path.join(root, "data/acs-zcta-demographics/releases", m.release_id),
    "release directory",
  );
  const config = JSON.parse(
      await fs.readFile(
        path.join(root, "config/acs-zcta-demographic-admission.json"),
        "utf8",
      ),
    ),
    metaRead = await secureRead(
      path.join(dir, "metadata.json"),
      2000000,
      options.signal,
    ),
    authRead = await secureRead(
      path.join(dir, "authorization.json"),
      100000,
      options.signal,
    ),
    packageRead = await secureRead(
      path.join(dir, "package-manifest.json"),
      200000,
      options.signal,
    );
  const metadata = validateOfficialMetadata(decode(metaRead), config),
    authorization = validateAuthorization(decode(authRead)),
    packageManifest = validateOfflinePackageManifest(decode(packageRead));
  check(
    packageManifest.vintage === metadata.vintage &&
      packageRead.sha256 === m.source.package_manifest_sha256,
    "package replay",
  );
  const registryReads = await Promise.all([
    secureRead(
      assertInsideApp(
        path.resolve(root, config.official_metadata_registry.path),
      ),
      500000,
      options.signal,
    ),
    secureRead(
      assertInsideApp(path.resolve(root, config.authorization_registry.path)),
      500000,
      options.signal,
    ),
    secureRead(
      assertInsideApp(path.resolve(root, config.source_policy.path)),
      200000,
      options.signal,
    ),
  ]);
  check(
    registryReads[0].sha256 === config.official_metadata_registry.sha256 &&
      registryReads[1].sha256 === config.authorization_registry.sha256 &&
      registryReads[2].sha256 === config.source_policy.sha256 &&
      registryReads[2].sha256 === m.source.source_policy_sha256,
    "registry or policy pins",
  );
  const metadataRegistry = decode(registryReads[0]),
    authorizationRegistry = decode(registryReads[1]);
  validateRegistries(metadataRegistry, authorizationRegistry);
  check(
    metadataRegistry.supported_releases?.some(
      (v) =>
        v?.vintage === metadata.vintage &&
        v?.dataset === metadata.dataset &&
        v?.metadata_sha256 === metaRead.sha256,
    ),
    "metadata registry replay",
  );
  check(
    authorizationRegistry.approved_receipts?.some(
      (v) =>
        v?.authorization_id === authorization.authorization_id &&
        v?.authorization_sha256 === authRead.sha256 &&
        v?.metadata_sha256 === metaRead.sha256 &&
        v?.data_sha256 === m.source.data_sha256 &&
        v?.vintage === metadata.vintage,
    ),
    "authorization registry replay",
  );
  const governed = await governedZctas(root, config, options.signal),
    data = await scanData(
      path.join(dir, "data.jsonl"),
      config,
      metadata,
      governed,
      options.signal,
    );
  check(
    data.sha256 === m.source.data_sha256 &&
      metaRead.sha256 === m.source.metadata_sha256 &&
      authRead.sha256 === m.source.authorization_sha256 &&
      m.source.record_count === 33791,
    "release replay",
  );
  const expected = [
    "authorization.json",
    "data.jsonl",
    "metadata.json",
    "package-manifest.json",
  ];
  check(
    Array.isArray(m.artifacts) &&
      m.artifacts.length === 4 &&
      JSON.stringify(m.artifacts.map((a) => a?.path).sort()) ===
        JSON.stringify(expected) &&
      m.artifacts.every(
        (a) =>
          exact(
            a,
            a.path === "data.jsonl"
              ? ["path", "bytes", "sha256", "record_count"]
              : ["path", "bytes", "sha256"],
          ) &&
          SHA.test(a.sha256) &&
          Number.isSafeInteger(a.bytes) &&
          a.bytes > 0 &&
          (a.path !== "data.jsonl" || a.record_count === 33791),
      ),
    "release artifacts",
  );
  for (const a of m.artifacts) {
    const actual =
      a.path === "data.jsonl"
        ? data
        : a.path === "metadata.json"
          ? metaRead
          : a.path === "authorization.json"
            ? authRead
            : packageRead;
    check(
      actual.sha256 === a.sha256 && actual.bytes === a.bytes,
      `${a.path} artifact`,
    );
    const packageArtifact = packageManifest.artifacts.find(
      (v) => v.path === a.path,
    );
    if (packageArtifact)
      check(
        packageArtifact.sha256 === a.sha256 &&
          packageArtifact.bytes === a.bytes,
        `${a.path} package binding`,
      );
  }
  check(
    JSON.stringify((await fs.readdir(dir)).sort()) ===
      JSON.stringify([
        "authorization.json",
        "data.jsonl",
        "manifest.json",
        "metadata.json",
        "package-manifest.json",
      ]),
    "release closed inventory",
  );
  return {
    verified: true,
    release_id: m.release_id,
    manifest_sha256: read.sha256,
    record_count: data.rows,
    network_requests: 0,
    current_pointer_written: false,
    production_enrollment: false,
  };
}
