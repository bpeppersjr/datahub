import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { echoReplay as r, STATE_DC_CODES, validateEchoNaicsRecord } from './national-epa-echo-naics-zip-industry-evidence.mjs';
import { verifyNaicsReference } from './us-census-naics-reference.mjs';

export const DATASET = 'national-epa-echo-operational-segment-evidence';
export const VERSION = `${DATASET}@1.0.0`;
export const STATUSES = ['missing-naics','invalid-in-all-reference-editions','unresolved-naics-edition','valid-outside-operational-segments','mapped','partially-unmapped','multisegment'];
const CONTRACTS = ['connectors','schemas','source-policies'].map(part => `config/${part}/${DATASET}${part === 'schemas' ? '.schema' : ''}.json`);
const EXPECTED_CROSSWALK = {
  schema_version:'epa-echo-operational-segment-crosswalk@1.0.0', editions:[1997,2002,2007,2012,2017,2022],
  segments:['construction','retail-consumer','financial-services','transportation','health-care','childcare'],
  combined_sector_components:{ '44':'44-45','45':'44-45','48':'48-49','49':'48-49' },
  rules:[
    { segment:'construction',prefixes:['23'],reference_root:'23',root_title_pattern:'^construction$' },
    { segment:'retail-consumer',prefixes:['44','45'],reference_root:'44-45',root_title_pattern:'^retail trade$' },
    { segment:'financial-services',prefixes:['52'],reference_root:'52',root_title_pattern:'^finance (and|&) insurance$' },
    { segment:'transportation',prefixes:['48','49'],reference_root:'48-49',root_title_pattern:'^transportation (and|&) warehousing$' },
    { segment:'health-care',prefixes:['621'],reference_root:'621',root_title_pattern:'^ambulatory health care services$' },
    { segment:'health-care',prefixes:['622'],reference_root:'622',root_title_pattern:'^hospitals$' },
    { segment:'health-care',prefixes:['623'],reference_root:'623',root_title_pattern:'^nursing (and|&) residential care facilities$' },
    { segment:'childcare',prefixes:['6244'],reference_root:'6244',root_title_pattern:'^child (day )?care services$' },
  ],
  unmapped_operational_segments:['tax-exempt-organizations','sales-tax-outlets','local-business-licenses'], broad_health_codes_unmapped:['62','624'],
  claims:{ naics_edition_inferred:false,primary_segment_inferred:false,cross_segment_counts_additive:false,childcare_in_health_care:false,edition_resolution:'Map only exact reference members with consistent segment and hierarchy semantics across every supported edition containing the code.' },
};
const normalizeTitle = title => title.toLowerCase().replaceAll(',', '').replaceAll(/\s+/g,' ').trim();

export function classifyExactEchoNaics(code, editions, crosswalk = EXPECTED_CROSSWALK) {
  r.check(typeof code === 'string' && /^\d{2,6}$/.test(code), 'reported exact NAICS syntax');
  const combined = crosswalk.combined_sector_components[code];
  const referenceCode = edition => editions.get(edition)?.has(code) ? code : combined && editions.get(edition)?.has(combined) ? combined : null;
  const present = crosswalk.editions.filter(edition => referenceCode(edition));
  if (!present.length) return { naics_code:code,status:'invalid-in-all-reference-editions',reference_editions:[],segment:null,reference_titles:[] };
  const matches = crosswalk.rules.filter(rule => rule.prefixes.some(prefix => code.startsWith(prefix)));
  const resolutions = present.map(edition => {
    if (!matches.length) return null;
    if (matches.length !== 1) return 'unresolved';
    const rule = matches[0], root = editions.get(edition).get(rule.reference_root);
    return root && new RegExp(rule.root_title_pattern).test(normalizeTitle(root.title)) ? rule.segment : 'unresolved';
  });
  const consistent = resolutions.every(value => value === resolutions[0]) && resolutions[0] !== 'unresolved';
  return { naics_code:code,status:!consistent ? 'unresolved-naics-edition' : resolutions[0] === null ? 'valid-outside-operational-segments' : 'mapped',reference_editions:present,segment:consistent ? resolutions[0] : null,reference_titles:present.map(edition => ({ edition,reference_code:referenceCode(edition),membership:referenceCode(edition) === code ? 'direct-reference-member' : 'combined-sector-component',title:editions.get(edition).get(referenceCode(edition)).title })) };
}

export function classifyEchoSegmentRecord(codes, lookup) {
  const memberships = new Map(), outcomes = codes.map(code => lookup(code));
  for (const item of outcomes) if (item.segment !== null) {
    if (!memberships.has(item.segment)) memberships.set(item.segment,[]);
    memberships.get(item.segment).push(item.naics_code);
  }
  const unmapped = outcomes.filter(item => item.segment === null), partial = memberships.size > 0 && unmapped.length > 0;
  const status = !codes.length ? 'missing-naics' : memberships.size > 1 ? 'multisegment' : partial ? 'partially-unmapped' : memberships.size === 1 ? 'mapped'
    : outcomes.every(item => item.status === 'invalid-in-all-reference-editions') ? 'invalid-in-all-reference-editions'
      : outcomes.some(item => item.status === 'unresolved-naics-edition') ? 'unresolved-naics-edition' : 'valid-outside-operational-segments';
  return { status,partial,memberships,outcomes };
}

const blank = segments => ({ source_record_count:0,exact_naics_assignments:0,records_with_multiple_naics:0,records_with_segment:0,records_with_unmapped_codes:0,records_partially_unmapped:0,segment_assignments:0,status_counts:Object.fromEntries(STATUSES.map(key => [key,0])),segments:new Map(segments.map(segment => [segment,{ source_record_count:0,triggering_codes:new Map() }])) });
function add(target, result) {
  target.source_record_count++; target.exact_naics_assignments += result.outcomes.length; target.records_with_multiple_naics += result.outcomes.length > 1 ? 1 : 0;
  target.status_counts[result.status]++; target.records_with_segment += result.memberships.size > 0 ? 1 : 0;
  target.records_with_unmapped_codes += result.outcomes.some(item => item.segment === null) ? 1 : 0;
  target.records_partially_unmapped += result.partial ? 1 : 0; target.segment_assignments += result.memberships.size;
  for (const [segment,codes] of result.memberships) {
    const value = target.segments.get(segment); value.source_record_count++;
    for (const code of codes) value.triggering_codes.set(code,(value.triggering_codes.get(code) ?? 0) + 1);
  }
}
function serialize(target) {
  const { segments,...counts } = target;
  r.check(Object.values(counts.status_counts).reduce((n,v) => n+v,0) === counts.source_record_count, 'disjoint status conservation');
  r.check([...segments.values()].reduce((n,v) => n+v.source_record_count,0) === counts.segment_assignments && counts.records_with_segment <= counts.segment_assignments, 'deduplicated segment conservation');
  return { ...counts,segments:[...segments].map(([segment,value]) => ({ segment,source_record_count:value.source_record_count,triggering_codes:[...value.triggering_codes].sort(([a],[b]) => a.localeCompare(b)).map(([naics_code,source_record_count]) => ({ naics_code,source_record_count })) })) };
}

async function load(root, configPath, signal) {
  const proof = await r.secureBuffer(root,r.contained(root,configPath ?? `config/${DATASET}.json`),100_000,signal), config = JSON.parse(proof.raw);
  r.check(r.exact(config,['schema_version','echo_replay_config','naics_reference','reference_roster_sha256','crosswalk']) && config.schema_version === `${DATASET}-config@1.0.0`, 'segment config shape');
  for (const binding of [config.echo_replay_config,config.crosswalk]) r.check(r.exact(binding,['path','sha256']) && /^[a-f0-9]{64}$/.test(binding.sha256), 'local contract binding');
  const replayProof = await r.secureBuffer(root,r.contained(root,config.echo_replay_config.path),100_000,signal);
  r.check(replayProof.sha256 === config.echo_replay_config.sha256,'EPA replay config drift');
  const input = await r.load(root,config.echo_replay_config.path,signal);
  const crosswalkProof = await r.secureBuffer(root,r.contained(root,config.crosswalk.path),100_000,signal), crosswalk = JSON.parse(crosswalkProof.raw);
  r.check(crosswalkProof.sha256 === config.crosswalk.sha256 && r.equal(crosswalk,EXPECTED_CROSSWALK),'crosswalk drift/semantics');
  const reference = await r.pinned(root,config.naics_reference,100_000,signal);
  r.check(reference.value.dataset_id === 'us-census-naics-reference' && reference.value.transformation_version === 'us-census-naics-reference@1.0.0' && r.equal(reference.value.editions,crosswalk.editions),'reference identity/editions');
  r.check(r.sha(JSON.stringify(reference.value.artifacts)) === config.reference_roster_sha256,'reference artifact roster drift');
  await verifyNaicsReference(reference.filename,{ root,signal });
  const codeDeclaration = r.declaration(reference,'codes.jsonl'), editions = new Map(crosswalk.editions.map(edition => [edition,new Map()]));
  // The reference declaration predates JSONL row-count declarations. Bind its
  // count to the independently verified manifest before using the same stream.
  await r.streamArtifact(root,path.dirname(reference.filename),{ ...codeDeclaration,record_count:reference.value.code_count },signal,row => {
    r.check(editions.has(row.edition) && !editions.get(row.edition).has(row.naics_code) && row.policy_id === 'us-census-naics-reference' && typeof row.title === 'string','reference code roster');
    editions.get(row.edition).set(row.naics_code,row);
  });
  const contractHashes = {};
  for (const relative of CONTRACTS) contractHashes[relative] = (await r.secureBuffer(root,r.contained(root,relative),200_000,signal)).sha256;
  return { ...input,segmentConfig:config,segmentProof:proof,crosswalk,crosswalkProof,reference,editions,contractHashes };
}

async function derive(input,output,signal,hook) {
  const { root,config,echo,coverage,geography,zipCohort,crosswalk,editions } = input;
  const zctas = new Set(), cohort = new Map(), coverageZips = new Map(), coverageStates = new Map();
  await r.streamArtifact(root,path.dirname(geography.filename),r.declaration(geography,'derived/index/zctas.jsonl'),signal,row => { r.check(/^\d{5}$/.test(row.geoid) && row.geo_type === 'zcta' && row.zcta === row.geoid && !zctas.has(row.geoid),'ZCTA identity'); zctas.add(row.geoid); });
  r.check(zctas.size === config.expected.zcta_rows,'ZCTA count');
  await r.streamArtifact(root,path.dirname(zipCohort.filename),r.declaration(zipCohort,'cohort.jsonl'),signal,row => {
    r.check(/^\d{5}$/.test(row.zip5) && !cohort.has(row.zip5) && r.CLASSIFICATIONS.includes(row.classification) && row.zcta_geoid === (zctas.has(row.zip5) ? row.zip5 : null) && (row.classification === 'same-code-census-zcta') === zctas.has(row.zip5) && row.usps_validity === null,'cohort classification');
    cohort.set(row.zip5,{ zip5:row.zip5,denominator_classification:row.classification,zcta_geoid:row.zcta_geoid });
  });
  r.check(cohort.size === config.expected.cohort_zip_rows && [...zctas].every(zip => cohort.has(zip)),'cohort conservation');
  await r.streamArtifact(root,path.dirname(coverage.filename),r.declaration(coverage,'jurisdictions.jsonl'),signal,row => { r.check(r.ALL_CODES.includes(row.code) && !coverageStates.has(row.code),'coverage state roster'); coverageStates.set(row.code,row); });
  await r.streamArtifact(root,path.dirname(coverage.filename),r.declaration(coverage,'zip5-coverage.jsonl'),signal,row => { r.check(/^\d{5}$/.test(row.code) && cohort.has(row.code) && !coverageZips.has(row.code) && row.zcta_membership?.geoid === (zctas.has(row.code) ? row.code : null),'coverage ZIP roster'); coverageZips.set(row.code,row); });
  r.check(coverageStates.size === config.expected.jurisdictions && coverageZips.size === config.expected.coverage_zip_rows,'coverage roster counts');
  const coverageSummary = await r.jsonArtifact(root,coverage,'coverage-summary.json',100_000,signal), sourceSummary = await r.jsonArtifact(root,echo,'derived/source-summary.json',100_000,signal);
  r.check(r.equal(coverageSummary.coverage,coverage.value.coverage) && r.equal(coverageSummary.source,coverage.value.source) && r.equal(coverageSummary.geography,coverage.value.geography),'coverage summary binding');
  const sources = echo.value.artifacts.filter(item => item.artifact_type === 'normalized-epa-echo-facility-jsonl-gzip');
  r.check(sources.length === 10 && new Set(sources.map(item => item.path)).size === 10 && sources.reduce((n,v) => n+v.record_count,0) === config.expected.source_rows,'source shard roster');
  const national = blank(crosswalk.segments), jurisdictions = new Map(r.ALL_CODES.map(code => [code,blank(crosswalk.segments)])), metrics = r.coverageBlank(), stateMetrics = new Map(r.ALL_CODES.map(code => [code,r.coverageBlank()])), seen = new Set(), artifacts = [], dense = [], classifications = new Map(), codeCounts = new Map();
  let positiveZips = 0, cells = 0;
  const lookup = code => { if (!classifications.has(code)) classifications.set(code,classifyExactEchoNaics(code,editions,crosswalk)); r.check(classifications.size <= r.LIMITS.distinct_naics,'distinct reported NAICS bound'); return classifications.get(code); };
  for (let prefix=0;prefix<10;prefix++) {
    r.stop(signal); const source = sources.find(item => item.path === `derived/facilities/zip-prefix=${prefix}.jsonl.gz`); r.check(source,'source prefix');
    const zipCounts = new Map(), zipMetrics = new Map(); let records = 0;
    await r.streamArtifact(root,path.dirname(echo.filename),source,signal,async record => {
      const { codes } = validateEchoNaicsRecord(record,echo.value,prefix,seen), zip = record.address.zip_code, state = record.address.state, hasZcta = zctas.has(zip);
      r.check(cohort.has(zip) && record.geography?.zcta_geoid === (hasZcta ? zip : null) && record.geography.zcta_match_status === (hasZcta ? '2020-zcta-polygon-available' : 'no-2020-zcta-polygon'),'retained source cohort/ZCTA relation');
      if (!zipCounts.has(zip)) { zipCounts.set(zip,blank(crosswalk.segments)); zipMetrics.set(zip,r.coverageBlank()); }
      const result = classifyEchoSegmentRecord(codes,lookup);
      for (const code of codes) codeCounts.set(code,(codeCounts.get(code) ?? 0)+1);
      add(national,result); add(jurisdictions.get(state),result); add(zipCounts.get(zip),result);
      r.addCoverage(metrics,record,hasZcta); r.addCoverage(stateMetrics.get(state),record,hasZcta); r.addCoverage(zipMetrics.get(zip),record,hasZcta);
      records++; await hook?.('source-row',{ prefix,records }); r.stop(signal);
    });
    positiveZips += zipCounts.size;
    const rows = [];
    for (const [zip,base] of [...cohort].filter(([zip]) => zip.startsWith(String(prefix))).sort(([a],[b]) => a.localeCompare(b))) {
      r.reconcile(zipMetrics.get(zip) ?? r.coverageBlank(),coverageZips.get(zip) ?? r.coverageBlank(),`ZIP ${zip}`);
      const result = serialize(zipCounts.get(zip) ?? blank(crosswalk.segments)), { segments,...counts } = result;
      dense.push({ schema_version:`${DATASET}-zip@1.0.0`,...base,...counts,segment_counts:segments.map(({ segment,source_record_count }) => ({ segment,source_record_count })) });
      for (const item of segments.filter(item => item.source_record_count > 0)) rows.push({ schema_version:`${DATASET}-zip-segment@1.0.0`,...base,...item });
    }
    cells += rows.length;
    artifacts.push(await r.writeRows(root,output,`zip-segments/prefix=${prefix}.jsonl.gz`,'epa-echo-zip-operational-segment-evidence-jsonl-gzip',rows,signal,hook));
  }
  r.check(national.source_record_count === config.expected.source_rows && positiveZips === config.expected.positive_source_zips,'source/ZIP count conservation');
  r.reconcile(metrics,coverageSummary,'national');
  for (const code of r.ALL_CODES) { r.reconcile(stateMetrics.get(code),coverageStates.get(code),code); r.check(sourceSummary.states_and_territories?.[code] === jurisdictions.get(code).source_record_count,'state source conservation'); }
  r.check(sourceSummary.accepted_active_facilities === national.source_record_count && r.ALL_CODES.reduce((n,code) => n+jurisdictions.get(code).source_record_count,0) === national.source_record_count,'jurisdiction conservation');
  const summary = { schema_version:VERSION,evidence_unit:'accepted source-defined active environmental-program facility record as of the retained ECHO source release',...serialize(national),state_dc_source_records:STATE_DC_CODES.reduce((n,code) => n+jurisdictions.get(code).source_record_count,0),territory_source_records:r.TERRITORIES.reduce((n,code) => n+jurisdictions.get(code).source_record_count,0),state_dc_rows:51,territory_rows:5,zip5_cohort_rows:cohort.size,positive_source_zip5_rows:positiveZips,zip5_segment_cells:cells,exact_naics_codes:classifications.size,out_of_cohort_source_records:0,missing_zip_source_records:0,unmapped_operational_segments:crosswalk.unmapped_operational_segments };
  const stateRows = codes => codes.map(code => ({ schema_version:`${DATASET}-jurisdiction@1.0.0`,code,jurisdiction_kind:r.TERRITORIES.includes(code) ? 'territory' : 'state-or-dc',...serialize(jurisdictions.get(code)) }));
  for (const [name,type,rows] of [
    ['summary.json','epa-echo-operational-segment-summary-json',[summary]],
    ['states.jsonl','epa-echo-operational-segment-state-evidence-jsonl',stateRows(STATE_DC_CODES)],
    ['territories.jsonl','epa-echo-operational-segment-territory-evidence-jsonl',stateRows(r.TERRITORIES)],
    ['zip5-evidence.jsonl.gz','epa-echo-operational-segment-zip-cohort-jsonl-gzip',dense],
    ['code-validation.jsonl','epa-echo-edition-validation-evidence-jsonl',[...classifications].sort(([a],[b]) => a.localeCompare(b)).map(([code,item]) => ({ schema_version:`${DATASET}-code@1.0.0`,...item,source_record_count:codeCounts.get(code) }))],
    ['out-of-cohort.jsonl','epa-echo-out-of-cohort-evidence-jsonl',[]],
    ['missing-zip.jsonl','epa-echo-missing-zip-evidence-jsonl',[]],
  ]) artifacts.push(await r.writeRows(root,output,name,type,rows,signal,hook));
  return { artifacts:artifacts.sort((a,b) => a.path.localeCompare(b.path)),summary };
}

function manifestFor(input,result,createdAt) {
  r.check(typeof createdAt === 'string' && new Date(createdAt).toISOString() === createdAt,'creation timestamp');
  const bindings = {};
  for (const [name,value] of [['echo',input.echo],['coverage',input.coverage],['geography',input.geography],['zip_cohort',input.zipCohort],['naics_reference',input.reference]]) bindings[name] = { manifest:path.relative(input.root,value.filename).replaceAll('\\','/'),manifest_sha256:value.proof.sha256,release_id:value.value.release_id };
  const body = { schema_version:VERSION,dataset_id:DATASET,status:'immutable-local-review-only',publication_mode:'pointer-free',created_at:createdAt,processing:{ source_shards:10,maximum_source_shards_in_memory:1,source_rows_buffered:0,limits:r.LIMITS },inputs:bindings,config_sha256:input.segmentProof.sha256,echo_replay_config:input.segmentConfig.echo_replay_config,crosswalk:input.segmentConfig.crosswalk,reference_roster_sha256:input.segmentConfig.reference_roster_sha256,reference_editions:input.crosswalk.editions,contract_sha256:input.contractHashes,summary:result.summary,claims:{ source_defined_active_program_facility_as_of:input.echo.value.source_updated_at,exact_reported_naics_only:true,exact_reference_membership_validated:true,naics_edition_inferred:false,primary_segment_inferred:false,cross_segment_counts_additive:false,childcare_in_health_care:false,unique_business_count:null,verified_site_count:null,current_operating_business_count:null,business_completeness:null,industry_completeness:null,authoritative_current_usps_zip_denominator:null,reported_zip4_joined:false,zcta_membership_is_usps_validity:false,generic_business_additivity_delta:0,names_addresses_coordinates_identifiers_exported:false,network_requests:0,acquisition_performed:false,current_pointer_written:false,production_enrollment:false,main_matrix_changed:false },verification_scope:'Checksum-bound original normalized ECHO source row replay; independently replayed six-edition Census vocabulary and hierarchy semantics; source record×segment deduplication. Source-native exporter normalization, unique site/business identity, edition attribution and current general operation are not independently established.',artifacts:result.artifacts };
  return { release_id:`${DATASET}-${r.sha(JSON.stringify(body))}`,...body };
}
async function inventory(directory) {
  const top = await fs.readdir(directory), nested = top.includes('zip-segments') ? (await fs.readdir(path.join(directory,'zip-segments'))).map(name => `zip-segments/${name}`) : [];
  return [...top.filter(name => name !== 'zip-segments'),...nested].sort();
}
export async function buildNationalEpaEchoOperationalSegmentEvidence(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)); r.stop(options.signal);
  r.check(options.createdAt === undefined || root !== APP_ROOT,'creation override requires isolated root');
  const input = await load(root,options.configPath,options.signal), createdAt = options.createdAt ?? new Date().toISOString(), base = r.contained(root,`data/${DATASET}`), releases = path.join(base,'releases'), lock = path.join(base,'.build.lock');
  await fs.mkdir(releases,{ recursive:true }); await r.canonical(root,releases);
  let locked = false,stage;
  try {
    await fs.mkdir(lock); locked = true; stage = path.join(base,`.stage-${randomUUID()}`); await fs.mkdir(stage);
    const result = await derive(input,stage,options.signal,options.hooks), manifest = manifestFor(input,result,createdAt), raw = r.encoded(manifest);
    r.stop(options.signal); await fs.writeFile(path.join(stage,'manifest.json'),raw,{ flag:'wx' });
    await options.hooks?.('after-manifest-before-verification',{ stage,manifest }); r.stop(options.signal);
    await verifyNationalEpaEchoOperationalSegmentEvidence(path.join(stage,'manifest.json'),{ root,configPath:options.configPath,signal:options.signal,allowStaging:true,expectedReleaseId:manifest.release_id });
    await options.hooks?.('after-verification-before-publication',{ stage,manifest }); r.stop(options.signal);
    const destination = path.join(releases,manifest.release_id);
    try { await fs.lstat(destination); r.check(false,'immutable destination already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(stage,destination); stage = null;
    return { releaseDirectory:destination,manifest,manifest_sha256:r.sha(raw),...manifest.summary };
  } finally { if (stage) { r.contained(base,stage); await fs.rm(stage,{ recursive:true,force:true }); } if (locked) await fs.rmdir(lock); }
}
export async function verifyNationalEpaEchoOperationalSegmentEvidence(manifestPath,options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)), filename = r.contained(root,manifestPath), proof = await r.secureBuffer(root,filename,200_000,options.signal), manifest = JSON.parse(proof.raw), directory = path.dirname(filename);
  r.check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && manifest.publication_mode === 'pointer-free' && new RegExp(`^${DATASET}-[a-f0-9]{64}$`).test(manifest.release_id),'segment manifest identity');
  r.check(path.basename(directory) === manifest.release_id || options.allowStaging === true && options.expectedReleaseId === manifest.release_id && /^\.stage-[a-f0-9-]+$/.test(path.basename(directory)),'release location');
  r.check(r.equal(await inventory(directory),['manifest.json','summary.json','states.jsonl','territories.jsonl','zip5-evidence.jsonl.gz','code-validation.jsonl','out-of-cohort.jsonl','missing-zip.jsonl',...Array.from({ length:10 },(_,prefix) => `zip-segments/prefix=${prefix}.jsonl.gz`)].sort()),'closed output inventory');
  const input = await load(root,options.configPath,options.signal), replay = await fs.mkdtemp(path.join(path.dirname(directory),'.verify-'));
  try {
    const result = await derive(input,replay,options.signal), expected = manifestFor(input,result,manifest.created_at);
    r.check(r.equal(manifest,expected),'independent segment manifest reconstruction');
    for (const item of expected.artifacts) { const actual = await r.secureBuffer(root,r.contained(directory,item.path),r.LIMITS.output_compressed,options.signal); r.check(actual.bytes === item.bytes && actual.sha256 === item.sha256,`independent segment artifact replay: ${item.path}`); }
    r.check((await r.secureBuffer(root,filename,200_000,options.signal)).sha256 === proof.sha256,'manifest changed during verification');
    return { verified:true,release_id:manifest.release_id,manifest_sha256:proof.sha256,...manifest.summary,claims:manifest.claims };
  } finally { r.contained(root,replay); await fs.rm(replay,{ recursive:true,force:true }); }
}
