import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, lstat, link, unlink, rmdir} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';

export const NE_SOURCE_ID = 'ne-childcare-aggregate-preflight';
const freezeDeep=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeDeep(child);Object.freeze(value);}return value;};
export const NE_SCOPE_CONTRACT = freezeDeep({
  version: 'ne-childcare-aggregate-scope@1.0.0',
  source_id: NE_SOURCE_ID,
  purpose: 'internal source-contract metadata and two fixed center-only aggregate observations',
  item_id: 'd3d3f44cb252424fb2f76e27162f534c',
  service_item_id: '4fce65a576fd49489db42f49b669fc79',
  layer_id: 0,
  categories: ['Child Care Center', 'Provisional Child Care Center'],
  requests: [
    'item-metadata', 'service-metadata', 'layer-metadata',
    'center-row-count-by-license-type', 'roster-date-count-and-extrema-by-license-type',
  ],
  exclusions: ['facility-rows', 'object-id-inventory', 'home-provider-identities', 'zip', 'geocoding', 'coverage', 'current-operation-claim'],
});
const canonical = value => JSON.stringify(value, (_key, child) => child && typeof child === 'object' && !Array.isArray(child)
  ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
const sha = value => createHash('sha256').update(value).digest('hex');
export const NE_SCOPE_CONTRACT_SHA256 = sha(canonical(NE_SCOPE_CONTRACT));
export const NE_PREFLIGHT_LIMITS = Object.freeze({maximum_requests:5, metadata_requests:3, aggregate_requests:2, minimum_request_spacing_ms:1000, request_timeout_ms:15000, maximum_response_bytes:1000000, session_deadline_ms:90000});
export const NE_ALLOWED_URLS = Object.freeze([
  'https://www.arcgis.com/sharing/rest/content/items/d3d3f44cb252424fb2f76e27162f534c?f=pjson',
  'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer?f=pjson',
  'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer/0?f=pjson',
  'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer/0/query?f=json&where=License_Type%20IN%20%28%27Child%20Care%20Center%27%2C%27Provisional%20Child%20Care%20Center%27%29&returnGeometry=false&groupByFieldsForStatistics=License_Type&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22center_rows%22%7D%5D',
  'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer/0/query?f=json&where=License_Type%20IN%20%28%27Child%20Care%20Center%27%2C%27Provisional%20Child%20Care%20Center%27%29&returnGeometry=false&groupByFieldsForStatistics=License_Type&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22Roster_Date%22%2C%22outStatisticFieldName%22%3A%22roster_rows%22%7D%2C%7B%22statisticType%22%3A%22min%22%2C%22onStatisticField%22%3A%22Roster_Date%22%2C%22outStatisticFieldName%22%3A%22roster_min%22%7D%2C%7B%22statisticType%22%3A%22max%22%2C%22onStatisticField%22%3A%22Roster_Date%22%2C%22outStatisticFieldName%22%3A%22roster_max%22%7D%5D',
]);
const CATEGORIES = NE_SCOPE_CONTRACT.categories;
const EVIDENCE_FILES = [
  'docs/states/NE-SOURCE-FOLLOWUP-2026-09-09.md',
  'docs/states/NE-PDF-INTERNAL-USE-2026-09-09.md',
  'docs/states/NE-CURRENT-EDITION-2026-09-09.md',
];
const CONNECTOR_FILE = path.join(APP_ROOT, 'config/connectors/ne-childcare-aggregate-preflight.json');
const POLICY_FILE = path.join(APP_ROOT, 'config/source-policies/ne-childcare-aggregate-preflight.json');
const DECISION_FILE = path.join(APP_ROOT, 'data/governance/ne-childcare-scope-decision.json');
const OUTPUT_ROOT = path.join(APP_ROOT, 'data/business-sources/ne-childcare-aggregate-preflight');
const TEST_OUTPUT_ROOT = path.join(APP_ROOT, 'data/tmp/ne-childcare-aggregate-preflight-tests');

function assert(condition, message, code='NE_PREFLIGHT_INVALID') { if (!condition) throw Object.assign(new Error(message), {code}); }
function safeObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function ownKeysExactly(value, keys) { return safeObject(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
async function ensureDataDirectory(directory,{create=false}={}) {
  const dataRoot=path.join(APP_ROOT,'data'),resolved=path.resolve(directory),relative=path.relative(dataRoot,resolved);
  assert(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Nebraska output must remain beneath app data.');
  const dataStat=await lstat(dataRoot).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(!dataStat&&create)await mkdir(dataRoot);const rootStat=await lstat(dataRoot);assert(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'App data root must be a real directory.');
  let current=dataRoot;
  for(const part of relative.split(path.sep)){current=path.join(current,part);let stat=await lstat(current).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));if(!stat&&create){await mkdir(current);stat=await lstat(current);}if(!stat)return;assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Nebraska output path cannot contain a symbolic link.');}
}
function arcgis(value, label) { assert(safeObject(value), `${label} must be a JSON object.`); assert(!Object.hasOwn(value, 'error'), `${label} returned an ArcGIS error.`); }
function findField(layer, name) { return layer.fields.find(field => field?.name === name); }
function checkMetadata(step, value) {
  arcgis(value, step);
  if (step === 'item') {
    assert(value.id === NE_SCOPE_CONTRACT.item_id && value.orgId === 'Sj9eBhzWwOMzQCfI' && value.owner === 'Builtin_User', 'NebraskaMAP item identity changed.');
    assert(value.url === 'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer', 'NebraskaMAP item service URL changed.');
    assert(typeof value.accessInformation === 'string' && /DHHS DPH Licensure/i.test(value.accessInformation) && /DHHS GIS/i.test(value.accessInformation), 'NebraskaMAP item attribution is missing or changed.');
    return {item_id:value.id, owner:value.owner, org_id:value.orgId, service_url:value.url, attribution:value.accessInformation};
  }
  if (step === 'service') {
    assert(value.serviceItemId === NE_SCOPE_CONTRACT.service_item_id && value.maxRecordCount === 2000, 'Nebraska DHHS service identity or record limit changed.');
    assert(Array.isArray(value.layers) && value.layers.length === 1 && value.layers[0]?.id === 0, 'Nebraska DHHS service layer roster changed.');
    assert(typeof value.capabilities === 'string' && ['Query','Extract'].every(c => value.capabilities.split(',').map(s=>s.trim()).includes(c)), 'Nebraska DHHS service capabilities changed.');
    return {service_item_id:value.serviceItemId, max_record_count:value.maxRecordCount, layers:value.layers.map(l=>({id:l.id,name:l.name})), capabilities:value.capabilities};
  }
  assert(value.id === 0 && value.objectIdField === 'OBJECTID' && value.geometryType === 'esriGeometryPoint', 'Nebraska DHHS layer identity or geometry changed.');
  assert((value.spatialReference?.wkid ?? value.spatialReference?.latestWkid) === 4326, 'Nebraska DHHS layer CRS changed.');
  assert(Array.isArray(value.fields), 'Nebraska DHHS layer field roster is missing.');
  const expectedFields={Full_Name:'esriFieldTypeString',License_Type:'esriFieldTypeString',License_Number:'esriFieldTypeString',Address:'esriFieldTypeString',Address_2:'esriFieldTypeString',City:'esriFieldTypeString',State:'esriFieldTypeString',County:'esriFieldTypeString',Zip_Code1:'esriFieldTypeDouble',Zip4:'esriFieldTypeString',Issue_Date:'esriFieldTypeDate',Roster_Date:'esriFieldTypeDateOnly',Geocoded_Date:'esriFieldTypeDateOnly',GIS_Status:'esriFieldTypeString'};
  for(const [name,type]of Object.entries(expectedFields))assert(findField(value,name)?.type===type,`Nebraska DHHS field schema changed for ${name}.`);
  assert(findField(value,'OBJECTID')?.type === 'esriFieldTypeOID', 'Nebraska DHHS object ID schema changed.');
  assert(findField(value,'License_Type')?.type === 'esriFieldTypeString', 'Nebraska DHHS category schema changed.');
  assert(findField(value,'Roster_Date')?.type === 'esriFieldTypeDateOnly', 'Nebraska DHHS roster date is not date-only.');
  const types = Array.isArray(value.types) ? value.types.map(type=>type?.name) : [];
  assert(CATEGORIES.every(category=>types.includes(category)), 'Nebraska DHHS center type templates changed.');
  assert(value.advancedQueryCapabilities?.supportsStatistics === true, 'Nebraska DHHS statistics capability is absent.');
  return {layer_id:value.id, object_id_field:value.objectIdField, geometry_type:value.geometryType, wkid:4326, selected_schema:Object.fromEntries(Object.entries(expectedFields).map(([name,type])=>[name,type])), center_types:CATEGORIES};
}
function checkAggregate(step, value) {
  arcgis(value, step);
  assert(!Object.hasOwn(value, 'objectIds') && !Object.hasOwn(value, 'exceededTransferLimit'), 'Aggregate response contains an unexpected row/ID payload.');
  assert(Array.isArray(value.features) && value.features.length === 2, 'Aggregate response must contain exactly the two reviewed center categories.');
  const results = {};
  for (const feature of value.features) {
    assert(safeObject(feature) && !Object.hasOwn(feature,'geometry') && safeObject(feature.attributes), 'Aggregate response contains geometry or malformed attributes.');
    const a = feature.attributes, category = a.License_Type;
    assert(CATEGORIES.includes(category) && !Object.hasOwn(results, category), 'Aggregate category is not the exact reviewed center type.');
    if (step === 'counts') {
      assert(Object.keys(a).length === 2 && Number.isSafeInteger(a.center_rows) && a.center_rows >= 0, 'Center row count aggregate schema is invalid.');
      results[category] = {source_rows:a.center_rows};
    } else {
      assert(Object.keys(a).length === 4 && Number.isSafeInteger(a.roster_rows) && a.roster_rows >= 0, 'Roster date aggregate count is invalid.');
      for (const field of ['roster_min','roster_max']) assert(typeof a[field] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a[field]) && new Date(`${a[field]}T00:00:00Z`).toISOString().slice(0,10) === a[field], 'Roster date aggregate must remain a date-only calendar string.');
      assert(a.roster_min <= a.roster_max, 'Roster date extrema are reversed.');
      results[category] = {roster_date_rows:a.roster_rows, roster_date_min:a.roster_min, roster_date_max:a.roster_max};
    }
  }
  assert(CATEGORIES.every(category => Object.hasOwn(results, category)), 'Aggregate category conservation failed.');
  return results;
}
async function bytesToJson(response, signal) {
  assert(response instanceof Response, 'Injected/source transport did not return a Response.');
  assert(response.status === 200 && !response.redirected && (!response.url || NE_ALLOWED_URLS.includes(response.url)), 'Source response status, redirect, or URL is invalid.');
  const contentType = response.headers.get('content-type') ?? '';
  assert(/^application\/json(?:\s*;|$)/i.test(contentType), 'Source response Content-Type must be application/json.');
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader !== null) assert(/^\d+$/.test(lengthHeader) && Number(lengthHeader) <= NE_PREFLIGHT_LIMITS.maximum_response_bytes, 'Source response exceeds the 1 MB declared size limit.');
  assert(response.body, 'Source response body is missing.');
  const reader = response.body.getReader(), chunks=[]; let bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});}; signal.addEventListener('abort',abort,{once:true});
  try {
    for (;;) {
      signal.throwIfAborted();const pending=reader.read();const part=await Promise.race([pending,new Promise((_,reject)=>{const abort=()=>reject(Object.assign(new Error('Response body deadline or cancellation elapsed.'),{code:'NE_REQUEST_ABORTED'}));const clear=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();pending.then(clear,clear);})]);signal.throwIfAborted();
      if(part.done)break;bytes+=part.value.byteLength;assert(bytes<=NE_PREFLIGHT_LIMITS.maximum_response_bytes,'Source response exceeds the 1 MB byte limit.');chunks.push(part.value);
    }
  } finally { signal.removeEventListener('abort',abort); reader.releaseLock(); }
  const body=Buffer.concat(chunks,bytes); if(lengthHeader!==null)assert(Number(lengthHeader)===bytes,'Source response Content-Length does not match the body.');
  let value; try { value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)); } catch { throw Object.assign(new Error('Source response is not strict UTF-8 JSON.'),{code:'NE_PREFLIGHT_JSON'}); }
  return {value,bytes,sha256:sha(body),content_type:contentType};
}
async function getEvidenceHashes() {
  const connector=await readFile(CONNECTOR_FILE),policy=await readFile(POLICY_FILE);
  const evidence=[]; for(const relative of EVIDENCE_FILES)evidence.push({path:relative,sha256:sha(await readFile(path.join(APP_ROOT,relative)))});
  return {connector_sha256:sha(connector),policy_sha256:sha(policy),evidence};
}
async function nativeDecision(hashes) {
  let stat; try { stat=await lstat(DECISION_FILE); } catch(error) { if(error.code==='ENOENT')return {valid:false,reason:'No separately recorded Nebraska scope decision exists.'}; throw error; }
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=20000,'Nebraska scope decision must be a small regular file.','NE_SCOPE_DECISION_INVALID');
  let decision; try { decision=JSON.parse(await readFile(DECISION_FILE,'utf8')); } catch { return {valid:false,reason:'Nebraska scope decision JSON is invalid.'}; }
  const keys=['schema_version','decision_id','decision','decided_by','decided_at','rationale','scope_contract_sha256','connector_sha256','policy_sha256','evidence'];
  if(!ownKeysExactly(decision,keys)||decision.schema_version!=='ne-childcare-scope-decision@1.0.0'||decision.decision_id!=='NE-DHHS-ARCGIS-AGGREGATE-2026'||decision.decision!=='approve-scoped-metadata-aggregate'||typeof decision.decided_by!=='string'||!decision.decided_by.trim()||typeof decision.rationale!=='string'||!decision.rationale.trim()||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(decision.decided_at)||new Date(decision.decided_at).toISOString()!==decision.decided_at)return {valid:false,reason:'Nebraska scope decision does not match the exact decision contract.'};
  if(decision.scope_contract_sha256!==NE_SCOPE_CONTRACT_SHA256||decision.connector_sha256!==hashes.connector_sha256||decision.policy_sha256!==hashes.policy_sha256||canonical(decision.evidence)!==canonical(hashes.evidence))return {valid:false,reason:'Nebraska scope decision hashes do not match the reviewed scope, connector, policy, and evidence.'};
  return {valid:true,decision_sha256:sha(canonical(decision)),decided_at:decision.decided_at};
}
function makeIntent(runId, startedAt, hashes, executionMode) { return {schema_version:'ne-childcare-aggregate-intent@1.0.0',run_id:runId,source_id:NE_SOURCE_ID,started_at:startedAt,execution_mode:executionMode,scope_contract_sha256:NE_SCOPE_CONTRACT_SHA256,...hashes,scope:NE_SCOPE_CONTRACT,limits:NE_PREFLIGHT_LIMITS,allowlisted_urls:NE_ALLOWED_URLS,facility_rows_requested:0}; }
function claims(status) { const complete=status==='COMPLETE';return {status,source_metadata_observed:complete,aggregate_observed:complete,facility_rows_acquired:0,current_operations_verified:false,coverage_promoted:false,zip_or_geography_claim:false}; }

async function persistRun({intent, receipt, root}) {
  await ensureDataDirectory(root,{create:true});const directory=path.join(root,intent.run_id);await mkdir(directory);
  const dirStat=await lstat(directory); assert(dirStat.isDirectory()&&!dirStat.isSymbolicLink(),'Output run path is not a regular directory.');
  const intentPath=path.join(directory,'intent.json'),receiptPath=path.join(directory,'receipt.json'),temp=path.join(directory,'manifest.tmp'),manifestPath=path.join(directory,'manifest.json');
  const writeExclusive=async(file,value)=>{const handle=await open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n','utf8');await handle.sync();}finally{await handle.close();}const info=await lstat(file);assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1,'Output artifact identity is invalid.');const raw=await readFile(file);return {bytes:raw.length,sha256:sha(raw)};};
  let published=false;
  try {
    const ih=await writeExclusive(intentPath,intent),rh=await writeExclusive(receiptPath,receipt);
    const manifest={schema_version:'ne-childcare-aggregate-bundle@1.0.0',run_id:intent.run_id,intent:{name:'intent.json',...ih},receipt:{name:'receipt.json',...rh}};
    await writeExclusive(temp,manifest);const reread=JSON.parse(await readFile(temp,'utf8'));assert(canonical(reread)===canonical(manifest),'Manifest changed before publication.');
    await link(temp,manifestPath);published=true;await unlink(temp);
    await verifyNeChildcarePreflightBundle(manifestPath);
    return {directory,manifest_path:manifestPath,manifest_sha256:sha(JSON.stringify(manifest,null,2)+'\n'),receipt};
  } catch(error) {
    if(!published){for(const file of [temp,receiptPath,intentPath])await unlink(file).catch(()=>{});await rmdir(directory).catch(()=>{});}
    else throw Object.assign(new Error('Nebraska manifest publication completed but post-publication verification failed; preserve bundle for inspection.'),{code:'NE_PUBLICATION_UNCERTAIN',cause:error,manifest_path:manifestPath});
    throw error;
  }
}
export async function verifyNeChildcarePreflightBundle(manifestPath) {
  const absolute=path.resolve(manifestPath),relative=path.relative(path.join(APP_ROOT,'data'),absolute);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Nebraska bundle must be stored under app data.');
  await ensureDataDirectory(path.dirname(absolute));
  const manifestStat=await lstat(absolute);assert(manifestStat.isFile()&&!manifestStat.isSymbolicLink()&&manifestStat.nlink>=1,'Manifest must be a regular file.');
  const manifest=JSON.parse(await readFile(absolute,'utf8'));assert(ownKeysExactly(manifest,['schema_version','run_id','intent','receipt'])&&manifest.schema_version==='ne-childcare-aggregate-bundle@1.0.0'&&/^[0-9a-f-]{36}$/.test(manifest.run_id),'Nebraska manifest schema is invalid.');
  const directory=path.dirname(absolute);
  for(const [entry,name]of [['intent','intent.json'],['receipt','receipt.json']]){assert(ownKeysExactly(manifest[entry],['name','bytes','sha256'])&&manifest[entry].name===name&&Number.isSafeInteger(manifest[entry].bytes)&&/^[a-f0-9]{64}$/.test(manifest[entry].sha256),'Nebraska manifest entry is invalid.');const file=path.join(directory,name),st=await lstat(file);assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1,'Nebraska artifact is not an immutable regular file.');const raw=await readFile(file);assert(raw.length===manifest[entry].bytes&&sha(raw)===manifest[entry].sha256,`Nebraska ${name} digest mismatch.`);}
  const intent=JSON.parse(await readFile(path.join(directory,'intent.json'),'utf8')),receipt=JSON.parse(await readFile(path.join(directory,'receipt.json'),'utf8'));
  assert(intent.run_id===manifest.run_id&&receipt.run_id===manifest.run_id&&intent.source_id===NE_SOURCE_ID&&intent.facility_rows_requested===0,'Nebraska intent/receipt binding failed.');
  assert(receipt.status==='HOLD'&&receipt.requests.length===0||receipt.status==='COMPLETE'&&receipt.requests.length===5||receipt.status==='CANCELLED'&&receipt.requests.length<=5||receipt.status==='FAILED'&&receipt.requests.length<=5,'Nebraska receipt status/request count is invalid.');
  assert(receipt.claims?.facility_rows_acquired===0&&receipt.claims?.current_operations_verified===false&&receipt.claims?.coverage_promoted===false,'Nebraska receipt contains an impermissible claim.');
  return {valid:true,run_id:manifest.run_id,status:receipt.status,requests:receipt.requests.length};
}

async function execute(fetchImpl,{signal:parentSignal,synthetic=false,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}) {
  const hashes=await getEvidenceHashes();let decision=null;
  if(!synthetic)decision=await nativeDecision(hashes).catch(()=>({valid:false,reason:'The separately recorded Nebraska scope decision could not be validated.'}));
  if(!synthetic&&!decision.valid)return {receipt:{schema_version:'ne-childcare-aggregate-receipt@1.0.0',source_id:NE_SOURCE_ID,status:'HOLD',reason:decision.reason,requests:[],claims:claims('HOLD'),facility_rows_requested:0,output_allocated:false},manifest_path:null,directory:null};
  const runId=randomUUID(),startedAt=new Date().toISOString(),intent=makeIntent(runId,startedAt,hashes,synthetic?'injected-test-transport':'native-fetch');
  const requests=[],summary={metadata:{},aggregates:{}}; let status='FAILED',reason=synthetic?'Injected transport failed before completing the fixed request plan.':'Separately recorded scope decision validated; running only the exact bounded prerequisite plan.',lastRequestAt=null;
  const session=AbortSignal.timeout(NE_PREFLIGHT_LIMITS.session_deadline_ms),signal=parentSignal?AbortSignal.any([parentSignal,session]):session;
  try {
    if(synthetic||decision.valid) {
      const steps=[['item',NE_ALLOWED_URLS[0]],['service',NE_ALLOWED_URLS[1]],['layer',NE_ALLOWED_URLS[2]],['counts',NE_ALLOWED_URLS[3]],['dates',NE_ALLOWED_URLS[4]]];
      for(const [step,url] of steps) {
        signal.throwIfAborted();assert(NE_ALLOWED_URLS.includes(url),'Request URL is not allowlisted.');
        if(lastRequestAt!==null){const delay=Math.max(0,NE_PREFLIGHT_LIMITS.minimum_request_spacing_ms-(now()-lastRequestAt));if(delay)await sleep(delay);signal.throwIfAborted();}
        lastRequestAt=now();const record={step,url,status:null,bytes:null,sha256:null,content_type:null,complete:false};requests.push(record);
        const timeout=AbortSignal.timeout(NE_PREFLIGHT_LIMITS.request_timeout_ms),requestSignal=AbortSignal.any([signal,timeout]);
        const pending=Promise.resolve().then(()=>fetchImpl(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:requestSignal,headers:{Accept:'application/json'}}));
        const response=await Promise.race([pending,new Promise((_,reject)=>{const abort=()=>reject(Object.assign(new Error('Request deadline or cancellation elapsed.'),{code:'NE_REQUEST_ABORTED'}));requestSignal.addEventListener('abort',abort,{once:true});if(requestSignal.aborted)abort();pending.finally(()=>requestSignal.removeEventListener('abort',abort));})]);
        record.status=response.status;
        const parsed=await bytesToJson(response,requestSignal);record.bytes=parsed.bytes;record.sha256=parsed.sha256;record.content_type=parsed.content_type;
        const content=step==='item'||step==='service'||step==='layer'?checkMetadata(step,parsed.value):checkAggregate(step,parsed.value);
        if(step==='item'||step==='service'||step==='layer')summary.metadata[step]=content;else summary.aggregates[step]=content;
        record.complete=true;
      }
      for(const category of CATEGORIES)assert(summary.aggregates.dates[category].roster_date_rows<=summary.aggregates.counts[category].source_rows,'Roster-date aggregate exceeds the corresponding source-row count; sequential observations are inconsistent.');
      status='COMPLETE';reason='Exact metadata and two fixed aggregates validated; no facility rows were requested.';
    }
  } catch(error) { status=signal.aborted?'CANCELLED':'FAILED'; reason=error.code==='NE_PREFLIGHT_JSON'?error.message:(error.code??'NE_PREFLIGHT_VALIDATION_FAILED'); }
  const finishedAt=new Date().toISOString();
  const receipt={schema_version:'ne-childcare-aggregate-receipt@1.0.0',run_id:runId,source_id:NE_SOURCE_ID,status,reason,started_at:startedAt,finished_at:finishedAt,execution_mode:intent.execution_mode,scope_contract_sha256:NE_SCOPE_CONTRACT_SHA256,...hashes,decision:decision?.valid?decision:null,limits:NE_PREFLIGHT_LIMITS,requests,summary,aggregate_snapshot:'Two separate sequential reads; not an atomic snapshot. No cross-request consistency is asserted.',claims:claims(status),response_bodies_retained:false,facility_rows_requested:0};
  const root=synthetic?TEST_OUTPUT_ROOT:OUTPUT_ROOT;
  const published=await persistRun({intent,receipt,root});
  return {...published,receipt};
}
export async function runNeChildcareAggregatePreflight({signal}={}) { return execute(globalThis.fetch,{signal}); }
export async function runNeChildcareAggregatePreflightWithTestTransport(fetchImpl,{signal,sleep,now}={}) { assert(typeof fetchImpl==='function','An injected fetch function is required.');return execute(fetchImpl,{signal,synthetic:true,sleep,now}); }
export async function getNeChildcareScopeDecisionContract() { const hashes=await getEvidenceHashes();return {path:'data/governance/ne-childcare-scope-decision.json',schema_version:'ne-childcare-scope-decision@1.0.0',decision_id:'NE-DHHS-ARCGIS-AGGREGATE-2026',decision:'approve-scoped-metadata-aggregate',scope_contract_sha256:NE_SCOPE_CONTRACT_SHA256,...hashes}; }
