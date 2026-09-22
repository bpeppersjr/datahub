import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { APP_ROOT } from './paths.mjs';
import { verifyCmsNppesCommunityRetailPharmacies } from './cms-nppes-community-retail-pharmacy.mjs';

const DEFAULT_POINTER = path.join(APP_ROOT, 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json');
const LIMIT_MAX = 100;

function queryValue(value, label, pattern) {
  if (value == null || value === '') return null;
  if (!pattern.test(value)) { const error = new Error(`${label} is invalid.`); error.statusCode = 400; throw error; }
  return value;
}

async function readGzipRecords(filename, rows) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) rows.push(JSON.parse(line));
}

export function createCmsNppesPharmacyView({ pointerPath = DEFAULT_POINTER } = {}) {
  let cached;
  async function load() {
    if (cached) return cached;
    cached = (async () => {
      const verification = await verifyCmsNppesCommunityRetailPharmacies(pointerPath);
      const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
      const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const releaseDirectory = path.dirname(manifestPath);
      const stateArtifact = manifest.artifacts.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-state-aggregate-json');
      const zipArtifact = manifest.artifacts.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl');
      const stateAggregate = JSON.parse(await readFile(path.join(releaseDirectory, stateArtifact.path), 'utf8'));
      const zipAggregate = (await readFile(path.join(releaseDirectory, zipArtifact.path), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      const rows = [];
      for (const artifact of manifest.artifacts.filter((item) => item.artifact_type === 'normalized-nppes-community-retail-pharmacy-jsonl-gzip')) await readGzipRecords(path.join(releaseDirectory, artifact.path), rows);
      return { verification, pointer, manifest, rows, stateRows: stateAggregate.rows, zipRows: zipAggregate };
    })().catch((error) => { cached = undefined; throw error; });
    return cached;
  }
  return {
    async get({ state, zip, query, limit = '25' } = {}) {
      const safeState = queryValue(state, 'State', /^(?:[A-Z]{2}|UNASSIGNED)$/);
      const safeZip = queryValue(zip, 'ZIP5', /^\d{5}$/);
      const safeQuery = query == null ? null : String(query).trim().slice(0, 100);
      const parsedLimit = limit == null || limit === '' ? 25 : Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) { const error = new Error('Limit must be a positive integer.'); error.statusCode = 400; throw error; }
      const safeLimit = Math.min(LIMIT_MAX, parsedLimit);
      const view = await load();
      if (safeState && safeState !== 'UNASSIGNED' && !view.stateRows.some((row) => row.state === safeState)) { const error = new Error('State is outside the governed NPPES pharmacy state/territory set.'); error.statusCode = 400; throw error; }
      const selectedStates = safeState === 'UNASSIGNED' ? [] : safeState ? view.stateRows.filter((row) => row.state === safeState) : view.stateRows;
      const selectedZips = safeZip ? view.zipRows.filter((row) => row.zip_code === safeZip) : view.zipRows;
      const matches = view.rows.filter((row) => (!safeState || (safeState === 'UNASSIGNED' ? !row.address : row.address?.state === safeState)) && (!safeZip || row.address?.zip_code === safeZip) && (!safeQuery || `${row.legal_business_name ?? ''} ${row.other_organization_name ?? ''} ${row.npi ?? ''}`.toLocaleLowerCase('en-US').includes(safeQuery.toLocaleLowerCase('en-US')))).slice(0, safeLimit).map((row) => ({
        pharmacy_record_id: row.pharmacy_record_id,
        npi: row.npi,
        legal_business_name: row.legal_business_name,
        other_organization_name: row.other_organization_name,
        address: row.address,
        geography: row.geography,
        taxonomy_assertions: row.taxonomy_assertions,
        mail_order_taxonomy_assertions: row.mail_order_taxonomy_assertions,
        temporal: row.temporal,
        provenance: row.provenance,
        claims: row.claims,
      }));
      return {
        schema_version: 'cms-nppes-community-retail-pharmacy-view@1.0.0',
        mode: 'cms-nppes-community-retail-pharmacy',
        status: 'available',
        source: { dataset_id: view.manifest.dataset_id, release_id: view.manifest.release_id, source_release_id: view.manifest.source_release_id, pointer_sha256: view.manifest.dependencies.nppes_organizations_pointer.sha256, manifest_sha256: view.manifest.dependencies.nppes_organizations_manifest.sha256 },
        coverage: view.manifest.coverage,
        claims: view.manifest.claims,
        selection: { state: safeState, zip5: safeZip, query: safeQuery, limit: safeLimit },
        states: selectedStates,
        zips: selectedZips.slice(0, safeLimit),
        names: matches,
        names_truncated: matches.length === safeLimit,
        limitations: view.manifest.limitations,
      };
    },
    close() { cached = undefined; return { closed: true }; },
  };
}

export const cmsNppesPharmacyView = createCmsNppesPharmacyView();
