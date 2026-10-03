import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {createHash, randomUUID} from 'node:crypto';
import {APP_ROOT, assertInsideApp} from './paths.mjs';

export const VERSION = 'zcta-demographic-input-readiness@1.0.0';
const EXPECTED = 33791;
const SHA = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`ZCTA demographic readiness rejected: ${message}.`); };
const check = (value, message) => value || fail(message);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;
const checkpoint = (signal) => signal?.throwIfAborted();
const sameIdentity = (left,right) => left?.isFile() && right?.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink() && left.nlink === 1n && right.nlink === 1n && ['dev','ino','size','mtimeNs','ctimeNs'].every((key)=>left[key]===right[key]);

export function validateZctaDemographicInputReadinessRow(row) {
  check(exactKeys(row, ['schema_version','zcta','geography_release_id','population_2020','housing_units_2020','availability','status','claims']), 'row schema');
  check(row.schema_version === '1.0.0' && /^\d{5}$/.test(row.zcta), 'row identity');
  check(safeCount(row.population_2020) && safeCount(row.housing_units_2020), 'direct totals');
  check(exactKeys(row.availability, ['population_2020','housing_units_2020','race','ancestry_lineage','sex','age']), 'availability schema');
  check(row.availability.population_2020 === true && row.availability.housing_units_2020 === true, 'direct total availability');
  for (const key of ['race','ancestry_lineage','sex','age']) check(row.availability[key] === false, `${key} availability`);
  check(row.status === 'partial-input-readiness', 'status');
  check(exactKeys(row.claims, ['usps_zip_code','demographic_percentages','gdp']) && Object.values(row.claims).every((value) => value === false), 'claims');
  return row;
}

async function readJson(file, maximum = 200000, signal) {
  checkpoint(signal);
  const stat = await fs.lstat(file, {bigint:true});
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size <= BigInt(maximum), 'unsafe JSON input');
  const raw = await fs.readFile(file);
  checkpoint(signal);
  return {value:JSON.parse(raw), raw, stat};
}

async function loadSource(root, configPath, signal) {
  checkpoint(signal);
  const configFile = assertInsideApp(path.resolve(root, configPath ?? 'config/zcta-demographic-input-readiness.json'));
  const {value:config} = await readJson(configFile, 200000, signal);
  check(config.expected_record_count === EXPECTED && config.publication_mode === 'immutable-local-review-only-pointer-free', 'configuration');
  const manifestFile = assertInsideApp(path.resolve(root, config.geography.manifest));
  const manifestRead = await readJson(manifestFile, 200000, signal);
  check(digest(manifestRead.raw) === config.geography.manifest_sha256, 'geography manifest hash');
  check(manifestRead.value.release_id === config.geography.release_id, 'geography release');
  const artifact = manifestRead.value.artifacts.find((entry) => entry.path === config.geography.artifact);
  check(artifact?.record_count === EXPECTED && artifact.sha256 === config.geography.artifact_sha256, 'registered ZCTA artifact');
  const artifactFile = assertInsideApp(path.join(path.dirname(manifestFile), artifact.path));
  const artifactStat=await fs.lstat(artifactFile,{bigint:true});
  check(artifactStat.isFile() && !artifactStat.isSymbolicLink() && artifactStat.nlink===1n && artifactStat.size===BigInt(artifact.bytes),'unsafe source artifact identity');
  return {config, manifestFile, manifestHash:config.geography.manifest_sha256, artifact, artifactFile, artifactStat};
}

async function derive(source, signal) {
  const input = createHash('sha256');
  const output = createHash('sha256');
  const rows = [];
  const seen = new Set();
  let inputBytes = 0;
  const stream = (await import('node:fs')).createReadStream(source.artifactFile);
  signal?.addEventListener('abort',()=>stream.destroy(signal.reason),{once:true});
  for await (const line of readline.createInterface({input:stream, crlfDelay:Infinity})) {
    checkpoint(signal);
    if (!line) continue;
    const raw = Buffer.from(`${line}\n`); input.update(raw); inputBytes += raw.length;
    const item = JSON.parse(line);
    check(/^\d{5}$/.test(item.zcta) && item.geoid === item.zcta && item.geo_type === 'zcta' && !seen.has(item.zcta), 'source row');
    check(safeCount(item.population_2020) && safeCount(item.housing_units_2020), 'source totals');
    seen.add(item.zcta);
    const row = validateZctaDemographicInputReadinessRow({schema_version:'1.0.0',zcta:item.zcta,geography_release_id:source.config.geography.release_id,population_2020:item.population_2020,housing_units_2020:item.housing_units_2020,availability:{population_2020:true,housing_units_2020:true,race:false,ancestry_lineage:false,sex:false,age:false},status:'partial-input-readiness',claims:{usps_zip_code:false,demographic_percentages:false,gdp:false}});
    const encoded = jsonBytes(row); output.update(encoded); rows.push(encoded);
  }
  check(seen.size === EXPECTED && inputBytes === source.artifact.bytes && input.digest('hex') === source.artifact.sha256, 'source conservation');
  check(sameIdentity(source.artifactStat,await fs.lstat(source.artifactFile,{bigint:true})),'source artifact changed during read');
  checkpoint(signal);
  return {rows, bytes:rows.reduce((sum,row) => sum + row.length, 0), sha256:output.digest('hex'), recordCount:seen.size};
}

function manifestFor(source, derived, createdAt, root=APP_ROOT) {
  check(typeof createdAt === 'string' && new Date(createdAt).toISOString() === createdAt, 'created_at');
  const body = {schema_version:VERSION,status:'local-review-only',publication_mode:'immutable-pointer-free',created_at:createdAt,source:{geography_release_id:source.config.geography.release_id,manifest_path:path.relative(root,source.manifestFile).replaceAll('\\','/'),manifest_sha256:source.manifestHash,artifact_path:source.artifact.path,artifact_sha256:source.artifact.sha256,record_count:EXPECTED},availability:{population_2020:true,housing_units_2020:true,race:false,ancestry_lineage:false,sex:false,age:false},claims:{network_requests:0,current_pointer_written:false,production_enrollment:false,usps_zip_code:false,demographic_percentages:false,gdp:false},artifacts:[{path:'zcta-demographic-input-readiness.jsonl',bytes:derived.bytes,sha256:derived.sha256,record_count:derived.recordCount}]};
  return {release_id:`zcta-demographic-input-readiness-${digest(JSON.stringify(body))}`,...body};
}

function validateManifest(manifest) {
  check(manifest.schema_version === VERSION && manifest.status === 'local-review-only' && manifest.publication_mode === 'immutable-pointer-free', 'manifest mode');
  const {release_id,...body} = manifest;
  check(release_id === `zcta-demographic-input-readiness-${digest(JSON.stringify(body))}`, 'release identity');
  check(manifest.source.record_count === EXPECTED && manifest.artifacts?.length === 1 && manifest.artifacts[0].record_count === EXPECTED && SHA.test(manifest.artifacts[0].sha256), 'manifest counts');
  check(manifest.claims.network_requests === 0 && manifest.claims.current_pointer_written === false && manifest.claims.production_enrollment === false && manifest.claims.usps_zip_code === false && manifest.claims.demographic_percentages === false && manifest.claims.gdp === false, 'manifest claims');
}

export async function verifyZctaDemographicInputReadiness(manifestPath, options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT);
  checkpoint(options.signal);
  const source = await loadSource(root, options.configPath, options.signal);
  const manifestFile = assertInsideApp(path.resolve(root, manifestPath));
  const read = await readJson(manifestFile, 200000, options.signal);
  const manifest = read.value; validateManifest(manifest);
  check(path.dirname(manifestFile) === path.join(root,'data/zcta-demographic-input-readiness/releases',manifest.release_id), 'release directory');
  check(manifest.source.manifest_sha256 === source.manifestHash && manifest.source.artifact_sha256 === source.artifact.sha256, 'source binding');
  const derived = await derive(source, options.signal);
  const expected = manifestFor(source, derived, manifest.created_at, root);
  check(JSON.stringify(expected) === JSON.stringify(manifest), 'independent manifest reconstruction');
  const artifactFile = path.join(path.dirname(manifestFile), manifest.artifacts[0].path);
  const artifactStat = await fs.lstat(artifactFile,{bigint:true});
  check(artifactStat.isFile() && !artifactStat.isSymbolicLink() && artifactStat.nlink === 1n, 'unsafe artifact identity');
  const artifactRaw = await fs.readFile(artifactFile);
  checkpoint(options.signal);
  check(artifactRaw.length === derived.bytes && digest(artifactRaw) === derived.sha256 && Buffer.compare(artifactRaw, Buffer.concat(derived.rows)) === 0, 'artifact replay');
  check(sameIdentity(artifactStat,await fs.lstat(artifactFile,{bigint:true})),'artifact changed during read');
  const names = (await fs.readdir(path.dirname(manifestFile))).sort();
  check(JSON.stringify(names) === JSON.stringify(['manifest.json','zcta-demographic-input-readiness.jsonl']), 'closed inventory');
  return {verified:true,release_id:manifest.release_id,manifest_sha256:digest(read.raw),record_count:EXPECTED,network_requests:0,current_pointer_written:false,production_enrollment:false};
}

export async function publishZctaDemographicInputReadiness(options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT);
  checkpoint(options.signal);
  check(options.createdAt === undefined, 'createdAt override is not supported');
  const invokedAt = new Date();
  const source = await loadSource(root, options.configPath, options.signal);
  const derived = await derive(source, options.signal);
  const createdAt = new Date().toISOString();
  check(new Date(createdAt).getTime() >= invokedAt.getTime() && new Date(createdAt).getTime() - invokedAt.getTime() < 15 * 60 * 1000, 'created_at outside build interval');
  const manifest = manifestFor(source, derived, createdAt, root);
  const base = path.join(root,'data/zcta-demographic-input-readiness');
  const releases = path.join(base,'releases'); const staging = path.join(base,'.staging');
  const locks=path.join(base,'.locks'); await fs.mkdir(releases,{recursive:true}); await fs.mkdir(staging,{recursive:true}); await fs.mkdir(locks,{recursive:true});
  const lock=path.join(locks,'build.lock'); const owner=randomUUID();
  try { await fs.mkdir(lock); await fs.writeFile(path.join(lock,'owner'),owner,{flag:'wx'}); }
  catch(error) { if(error.code==='EEXIST') fail('concurrent build lock'); throw error; }
  const target = path.join(releases,manifest.release_id);
  const stage = path.join(staging,randomUUID()); await fs.mkdir(stage);
  try {
    checkpoint(options.signal);
    await fs.writeFile(path.join(stage,manifest.artifacts[0].path),Buffer.concat(derived.rows),{flag:'wx'});
    checkpoint(options.signal);
    await fs.writeFile(path.join(stage,'manifest.json'),jsonBytes(manifest),{flag:'wx'});
    checkpoint(options.signal);
    await fs.rename(stage,target);
    return {...await verifyZctaDemographicInputReadiness(path.join(target,'manifest.json'),{root,configPath:options.configPath,signal:options.signal}),reused:false,directory:target};
  } catch (error) { const resolved=path.resolve(stage); check(resolved.startsWith(path.resolve(staging)+path.sep),'stage cleanup ownership'); await fs.rm(resolved,{recursive:true,force:true}); throw error; }
  finally { const token=await fs.readFile(path.join(lock,'owner'),'utf8').catch(()=>null); if(token===owner) await fs.rm(lock,{recursive:true,force:true}); }
}
