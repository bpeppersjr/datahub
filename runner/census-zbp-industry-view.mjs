import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import { APP_ROOT } from "./paths.mjs";

const DEFAULT_POINTER = path.join(APP_ROOT, "data/business-baselines/census-zbp/current.json");
const MAX_RESULTS = 35_000;

function fail(message, statusCode = 503) { throw Object.assign(new Error(message), { statusCode }); }
function inside(base, target) { const relative = path.relative(base, target); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
async function contained(base, target, label) {
  if (!inside(base, target)) fail(`${label} escapes its governed root.`);
  const resolved = await realpath(target);
  if (!inside(await realpath(base), resolved)) fail(`${label} resolves outside its governed root.`);
  return resolved;
}
async function verifyFile(filename, expected, signal) {
  let bytes = 0; const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { signal })) { signal?.throwIfAborted(); bytes += chunk.length; hash.update(chunk); }
  if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256) fail(`Retained ZBP artifact failed integrity verification: ${expected.path}.`);
}
function validCode(value) { return typeof value === "string" && value.length === 6 && /^[0-9\/-]+$/.test(value); }

export function createCensusZbpIndustryView({ pointerPath = DEFAULT_POINTER, cacheLimit = 8 } = {}) {
  let loaded, closed = false; const cache = new Map(), active = new Set(), lifecycle = new AbortController();
  async function load(signal) {
    signal?.throwIfAborted();
    if (loaded) return loaded;
    const root = path.dirname(pointerPath), pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    if (pointer.dataset_id !== "census-zbp-baseline" || !pointer.manifest) fail("Census ZBP pointer is invalid.");
    const manifestPath = await contained(root, path.resolve(root, pointer.manifest), "Census ZBP manifest");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.dataset_id !== "census-zbp-baseline" || manifest.release_id !== pointer.release_id || manifest.complete_national_release !== true || manifest.reference_year !== 2023) fail("Census ZBP release identity or governed year is invalid.");
    const release = path.dirname(manifestPath), artifacts = manifest.artifacts ?? [];
    const coverage = artifacts.find(item => item.path === "derived/zip-coverage.jsonl");
    const naics = artifacts.find(item => item.path === "derived/naics-coverage.jsonl");
    const partitions = artifacts.filter(item => item.artifact_type === "normalized-zbp-naics-csv-gzip").sort((a,b) => a.partition.localeCompare(b.partition));
    if (!coverage || !naics || partitions.length !== 10 || partitions.some((item, i) => item.partition !== String(i))) fail("Census ZBP industry artifact set is incomplete.");
    const zcta = new Set();
    const coveragePath = await contained(release, path.resolve(release, coverage.path), "ZBP ZIP coverage");
    await verifyFile(coveragePath, coverage, signal);
    {
      const lines = createInterface({ input: createReadStream(coveragePath, { signal }), crlfDelay: Infinity });
      for await (const line of lines) { signal?.throwIfAborted(); if (line) { const row = JSON.parse(line); if (row.geography?.status === "2020-zcta-polygon-available" && row.geography.geoid === row.zip_code) zcta.add(row.zip_code); } }
    }
    const codes = new Set();
    const naicsPath = await contained(release, path.resolve(release, naics.path), "ZBP NAICS coverage");
    await verifyFile(naicsPath, naics, signal);
    {
      const lines = createInterface({ input: createReadStream(naicsPath, { signal }), crlfDelay: Infinity });
      for await (const line of lines) { signal?.throwIfAborted(); if (line) { const row = JSON.parse(line); if (!validCode(row.naics_code)) fail("Retained ZBP NAICS catalog contains an invalid code."); codes.add(row.naics_code); } }
    }
    loaded = { manifest, release, partitions, zcta, codes }; return loaded;
  }
  async function run({ naics, limit = MAX_RESULTS } = {}, signal) {
    if (!validCode(naics)) fail("An exact six-character Census NAICS publication code is required.", 400);
    const bounded = Number(limit);
    if (!Number.isSafeInteger(bounded) || bounded < 1 || bounded > MAX_RESULTS) fail(`limit must be between 1 and ${MAX_RESULTS}.`, 400);
    const source = await load(signal);
    if (!source.codes.has(naics)) fail("The exact NAICS code is not published in the retained release.", 404);
    if (!cache.has(naics)) {
      const records = [], states = new Map();
      for (const artifact of source.partitions) {
        const filename = await contained(source.release, path.resolve(source.release, artifact.path), "ZBP industry partition");
        await verifyFile(filename, artifact, signal);
        const rows = createReadStream(filename, { signal }).pipe(createGunzip()).pipe(parse({ columns: true }));
        for await (const row of rows) if (row.naics_code === naics) {
            signal?.throwIfAborted();
            const establishments = Number(row.establishments);
            if (!/^\d{5}$/.test(row.zip_code) || !Number.isSafeInteger(establishments) || establishments < 0) fail("Retained ZBP industry row is invalid.");
            const state = String(row.preferred_state ?? "").trim();
            const record = { zip5: row.zip_code, zcta_geoid: source.zcta.has(row.zip_code) ? row.zip_code : null, polygon_membership: source.zcta.has(row.zip_code) ? "exact-code-zcta" : "no-exact-code-zcta", state: /^[A-Z]{2}$/.test(state) ? state : null, establishments };
            records.push(record);
            const key = record.state ?? "unassigned"; states.set(key, (states.get(key) ?? 0) + establishments);
        }
      }
      cache.set(naics, { records, states: [...states].sort(([a],[b]) => a.localeCompare(b)).map(([state, establishments]) => ({ state, establishments })) });
      if (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    }
    const value = cache.get(naics);
    return Object.freeze({ schema_version: "census-zbp-industry-view@1.0.0", dataset_id: source.manifest.dataset_id, release_id: source.manifest.release_id, reference_year: 2023, naics_code: naics, row_status: "published-positive-or-explicit-zero-only", absent_row_semantics: "not-published-not-zero", universe: "employer-establishments-with-paid-employees-that-operated-during-at-least-part-of-reference-year", current_operating_status_verified: false, named_businesses: false, hierarchical_aggregation_permitted: false, total: value.records.length, records: value.records.slice(0, bounded), truncated: value.records.length > bounded, states: value.states });
  }
  async function get(query, { signal } = {}) {
    if (closed) fail("Census ZBP industry view is closed.");
    const combined = signal ? AbortSignal.any([signal, lifecycle.signal]) : lifecycle.signal;
    const operation = run(query, combined); active.add(operation);
    try { return await operation; } finally { active.delete(operation); }
  }
  async function close() { closed = true; lifecycle.abort(); await Promise.allSettled([...active]); return { active_queries: active.size }; }
  return Object.freeze({ get, close });
}
