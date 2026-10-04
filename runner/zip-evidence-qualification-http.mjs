// Read-only adapter. Runtime must supply the existing full control-plane guard.
const categories=new Set(['all','retail-consumer','health-care','financial-services','tax-exempt-organizations','food-production','environmental-facilities','transportation','childcare','licensed-businesses','registrations-nonprofits','aggregate-baseline-context']);
const check=ok=>{if(!ok)throw Error('Invalid qualification projection.');};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._@:+-]{0,159}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const claims={current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,overlapping_units_additive:false};
const scopeSummary={assessment_as_of:'2026-10-02T16:30:00.000Z',qualification_sources:29,zip_cohort_members:48194,source_zip_pair_unit:'one retained source row for one ZIP5; source rows and counts are overlapping and nonadditive',within_review_window:{source_count:24,source_zip_pairs:1156656,positive_source_zip_pairs:301657,positive_zip_union:47989},stale_review_due:{source_count:1,source_zip_pairs:48194,positive_source_zip_pairs:1500,positive_zip_union:1500},unmeasured:{source_count:4,source_zip_pairs:192776,positive_source_zip_pairs:1964,positive_zip_union:1964},within_window_semantics:{source_defined_current_membership:{source_count:20,positive_source_zip_pairs:209117,positive_zip_union:45845},non_active_reporting_membership:{source_count:4,positive_source_zip_pairs:92540,positive_zip_union:39106}},claims:{current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,source_zip_counts_additive:false}};
const counts=value=>{check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=32);for(const[key,total]of Object.entries(value))check(/^[a-z][a-z0-9_]{0,100}_count$/.test(key)&&Number.isSafeInteger(total)&&total>=0);return {...value};};
const reference=value=>{check(value===null||typeof value==='string'&&value.length<=64&&!/[\r\n\\/]/.test(value));return value;};

export function projectZipEvidenceQualification(value,{zip,categoryId}){
 check(value&&value.zip5===zip&&value.category_id===categoryId&&typeof value.available==='boolean');
 const base={schema_version:'zip-evidence-qualification-view@1.1.0',zip5:zip,category_id:categoryId,available:value.available};
 if(!value.available){check(['not-enrolled','unavailable','incompatible-bindings','corrupt-release'].includes(value.status));return {...base,status:value.status,selection_status:'unavailable',release:null,bindings:null,semantic_provenance:null,semantic_compatibility:null,assessment_as_of:null,export_policy:null,rows:[],review_qualification_gap:null,claims:{...claims}};}
 check(value.status==='verified-immutable-projection'&&['matched','absent','unsupported'].includes(value.selection_status));
 check(['internal','local-review-only'].includes(value.export_policy)&&Object.entries(claims).every(([key,expected])=>value.claims?.[key]===expected));
 const r=value.release,b=value.bindings;
 check(r&&id(r.id)&&hash(r.manifest_sha256)&&instant(r.as_of)&&instant(r.created_at)&&Date.parse(r.created_at)>=Date.parse(r.as_of)&&id(r.temporal_policy_version));
 check(instant(value.assessment_as_of)&&value.assessment_as_of===r.as_of&&value.semantic_compatibility==='exact-registry-and-coverage-lineage-match'&&JSON.stringify(value.review_scope_summary)===JSON.stringify(scopeSummary));
 const semantic=value.semantic_provenance;check(semantic&&id(semantic.release_id)&&/^national-business-temporal-claim-matrix-[a-f0-9]{64}$/.test(semantic.release_id)&&['manifest_sha256','artifact_sha256','registry_manifest_sha256','coverage_manifest_sha256'].every(key=>hash(semantic[key]))&&['registry_release_id','coverage_release_id'].every(key=>id(semantic[key])));
 check(b&&['coverage_release_id','registry_release_id','mapping_version','taxonomy_version'].every(key=>id(b[key]))&&['coverage_manifest_sha256','registry_manifest_sha256','mapping_sha256'].every(key=>hash(b[key])));
 check(Array.isArray(value.rows)&&value.rows.length<=30&&(value.selection_status==='matched'?value.rows.length>0:value.rows.length===0));
 const seen=new Set();
 const rows=value.rows.map(row=>{
  check(id(row.source_key)&&id(row.source_release_id)&&!seen.has(row.source_key));seen.add(row.source_key);
  check(['measured-within-review-window','measured-stale-review-due','unmeasured'].includes(row.qualification));
  check(id(row.evidence_type)&&id(row.source_kind));
  const observed=counts(row.evidence_counts_by_unit),eligible=row.eligible_evidence_counts_by_unit;
  check(eligible&&Object.keys(eligible).length===Object.keys(observed).length);
  for(const[unit,total]of Object.entries(observed))check(Object.hasOwn(eligible,unit)&&eligible[unit]===(row.qualification==='unmeasured'?null:row.qualification==='measured-stale-review-due'?0:total));
  const temporal=row.temporal_status;
  check(temporal&&['within-review-window','review-due','missing-source-reference','future-source-reference','unconfigured-source-policy'].includes(temporal.status));
  check(row.qualification===(temporal.status==='within-review-window'?'measured-within-review-window':temporal.status==='review-due'?'measured-stale-review-due':'unmeasured'));
  check(row.current_operations_verified===false&&row.current_operating_business_count===null&&row.all_business_completion_percent===null&&row.all_business_denominator===null);
  const semantics=row.source_semantics;check(semantics&&['source-defined-current-membership','non-active-reporting-membership','annual-aggregate'].includes(semantics.classification)&&typeof semantics.source_status_term==='string'&&semantics.source_status_term.length<=160&&typeof semantics.cohort_scope==='string'&&semantics.cohort_scope.length<=200&&typeof semantics.jurisdiction_scope==='string'&&semantics.jurisdiction_scope.length<=100&&hash(semantics.policy_sha256));
  const clock=row.review_clock;check(clock&& (clock.source_reference_at===null||instant(clock.source_reference_at))&&(clock.age_days===null||Number.isSafeInteger(clock.age_days))&&(clock.review_after_days===null||Number.isSafeInteger(clock.review_after_days)&&clock.review_after_days>=0)&&typeof clock.cadence_class==='string'&&clock.cadence_class.length<=120);
  const window=row.observation_window;check(window&&(window.first_seen===null||instant(window.first_seen))&&(window.last_seen===null||instant(window.last_seen))&&typeof window.meaning==='string'&&window.meaning.length<=240);
  const retained=row.retained_source_observation;check(retained===null||retained&&instant(retained.observed_at)&&typeof retained.meaning==='string'&&retained.meaning.length<=240);
  return {source_key:row.source_key,source_release_id:row.source_release_id,source_kind:row.source_kind,evidence_type:row.evidence_type,qualification:row.qualification,
   temporal_status:{status:temporal.status,source_reference_field:reference(temporal.source_reference_field),source_reference_date:reference(temporal.source_reference_date),review_due_date:reference(temporal.review_due_date)},
   source_semantics:{classification:semantics.classification,source_status_term:semantics.source_status_term,cohort_scope:semantics.cohort_scope,jurisdiction_scope:semantics.jurisdiction_scope,policy_sha256:semantics.policy_sha256},
   review_clock:{source_reference_at:clock.source_reference_at,age_days:clock.age_days,review_after_days:clock.review_after_days,cadence_class:clock.cadence_class},
   observation_window:{first_seen:window.first_seen,last_seen:window.last_seen,meaning:window.meaning},retained_source_observation:retained?{observed_at:retained.observed_at,meaning:retained.meaning}:null,
   evidence_counts_by_unit:observed,eligible_evidence_counts_by_unit:{...eligible},current_operations_verified:false,current_operating_business_count:null,all_business_completion_percent:null,all_business_denominator:null};
 });
 const positive=rows.filter(row=>Object.values(row.evidence_counts_by_unit).some(total=>total>0)),positiveQualifications=new Set(positive.map(row=>row.qualification));
 const reviewGap=positive.length&&positiveQualifications.size===1&&positiveQualifications.has('unmeasured')?{status:'unknown-only',positive_source_count:positive.length,source_keys:positive.map(row=>row.source_key)}:positive.length&&positiveQualifications.size===1&&positiveQualifications.has('measured-stale-review-due')?{status:'stale-only',positive_source_count:positive.length,source_keys:positive.map(row=>row.source_key)}:null;
 return {...base,status:value.status,selection_status:value.selection_status,release:{id:r.id,manifest_sha256:r.manifest_sha256,as_of:r.as_of,created_at:r.created_at,temporal_policy_version:r.temporal_policy_version},
  assessment_as_of:value.assessment_as_of,semantic_compatibility:value.semantic_compatibility,semantic_provenance:{...semantic},review_scope_summary:{...scopeSummary},
  bindings:Object.fromEntries(['coverage_release_id','coverage_manifest_sha256','registry_release_id','registry_manifest_sha256','mapping_version','mapping_sha256','taxonomy_version'].map(key=>[key,b[key]])),export_policy:value.export_policy,rows,review_qualification_gap:reviewGap,claims:{...claims}};
}

// Called only after the server's existing Host/Origin prepare guard. Browser
// preflight names the Authorization header; it does not carry the bearer token.
export function zipEvidenceQualificationPreflight(request,response,json){
 const headers=request.headers??{};
 if(request.method!=='OPTIONS'||typeof headers.origin!=='string'||headers['access-control-request-method']!=='GET'||String(headers['access-control-request-headers']??'').trim().toLowerCase()!=='authorization'||headers['transfer-encoding']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0'){
  response.setHeader?.('Connection','close');json(response,400,{error:'Qualification preflight requires GET and the authorization header.'});return;
 }
 response.setHeader('Access-Control-Allow-Methods','GET');response.setHeader('Access-Control-Allow-Headers','Authorization');response.writeHead(204);response.end();
}

export async function zipEvidenceQualificationHttp(request,response,url,{reader,authorize},json){
 // authorize must perform the existing full Host/Origin/bearer guard and return true.
 try{if(typeof authorize!=='function'||await authorize(request)!==true)throw Error();}catch{json(response,401,{error:'Qualification lookup requires authorization.'});return;}
 const zip=url.searchParams.get('zip'),categoryId=url.searchParams.get('category')??'all';
 const headers=request.headers??{};
 if(request.method!=='GET'||url.searchParams.getAll('zip').length!==1||url.searchParams.getAll('category').length>1||[...url.searchParams.keys()].some(key=>!['zip','category'].includes(key))||!/^\d{5}$/.test(zip??'')||!categories.has(categoryId)||headers['transfer-encoding']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0'){response.setHeader?.('Connection','close');json(response,400,{error:'Provide one exact ZIP5 and a supported category on an empty GET.'});return;}
 const controller=new AbortController();let disconnected=false,rejectAbort;
 const abort=()=>{if(!response.writableEnded){disconnected=true;controller.abort();}};
 const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('Qualification read aborted.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});aborted.catch(()=>{});
 const timer=setTimeout(()=>controller.abort(),30000);request.once?.('aborted',abort);response.once?.('close',abort);request.resume?.();
 try{if(request.aborted||response.destroyed)abort();controller.signal.throwIfAborted();check(typeof reader==='function');const value=await Promise.race([reader({zip,categoryId,signal:controller.signal}),aborted]);controller.signal.throwIfAborted();if(!response.writableEnded&&!response.destroyed){const body=projectZipEvidenceQualification(value,{zip,categoryId});check(Buffer.byteLength(JSON.stringify(body))<=262144);response.setHeader?.('Cache-Control','no-store');json(response,200,body);}}
 catch{if(!disconnected&&!response.destroyed&&!response.writableEnded)json(response,503,{error:'Qualification evidence is unavailable or incompatible. No assessment was rebuilt.'});}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);request.removeListener?.('aborted',abort);response.removeListener?.('close',abort);}
}
