import {loadCmsNursingHomeChainReportingInput,cmsNursingHomeChainFixture} from './cms-nursing-home-chain-reporting-input.mjs';

const VERSION='cms-nursing-home-chain-assertions@1.0.0';
const INPUT_VERSION='cms-nursing-home-chain-reporting-input@1.0.0';
const assertionViews=new WeakSet();
const check=v=>{if(!v)throw Error('CMS nursing-home chain assertions rejected.');};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const safeObject=v=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const sourceId=(csvSha256,row)=>`cms-pdc:4pq5-n9py:${csvSha256}:row:${row}`;

function validate(snapshot,nativeRequired){
 check(safeObject(snapshot)&&snapshot.schemaVersion===INPUT_VERSION&&snapshot.nativeSourceVerified===nativeRequired&&snapshot.verificationMode===(nativeRequired?'native-retained-recovery-replayed':'synthetic-fixture-only'));
 check(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.rows)&&Object.isFrozen(snapshot.evidence)&&snapshot.rows.length<=25000);
 const e=snapshot.evidence;
 if(nativeRequired){
  check(safeObject(e)&&e.schemaVersion==='cms-nursing-home-reporting-input@1.0.0'&&e.manifestPath==='data/business-sources/cms-nursing-home-provider-information/recoveries/9fe3aa54-dd38-42be-b28e-b1d363300a45/manifest.json'&&/^[a-f0-9]{64}$/.test(e.manifestSha256));
  check(safeObject(e.selectedArtifact)&&typeof e.selectedArtifact.path==='string'&&/^[a-f0-9]{64}$/.test(e.selectedArtifact.sha256)&&Number.isSafeInteger(e.selectedArtifact.rows));
  check(safeObject(e.rawCsv)&&typeof e.rawCsv.path==='string'&&/^[a-f0-9]{64}$/.test(e.rawCsv.sha256)&&Number.isSafeInteger(e.rawCsv.bytes));
  check(e.rawCsv.sha256===snapshot.rows[0]?.csvSha256&&e.sourceReplayThisRead===true&&e.nativeTransportThisRead===false);
 }
 check(Array.isArray(snapshot.groups)&&safeObject(snapshot.summary));
 check(snapshot.summary.directoryRows===snapshot.rows.length&&snapshot.summary.rowsWithLexicallyValidChainId+snapshot.summary.rowsMissingChainId+snapshot.summary.rowsUnresolvedChainId===snapshot.rows.length);
 const ccnSeen=new Set();
 for(let i=0;i<snapshot.rows.length;i++){
  const r=snapshot.rows[i];check(safeObject(r)&&safeObject(r.identifier)&&r.identifier.type==='cms-certification-number'&&/^[A-Za-z0-9]{6}$/.test(r.identifier.value)&&!ccnSeen.has(r.identifier.value));ccnSeen.add(r.identifier.value);
  check(r.sourceRow===i+2&&/^[a-f0-9]{64}$/.test(r.csvSha256)&&r.sourceRecordId===sourceId(r.csvSha256,r.sourceRow));
  check(safeObject(r.chainName)&&typeof r.chainName.raw==='string'&&safeObject(r.chainId)&&typeof r.chainId.raw==='string'&&safeObject(r.reportedFacilities)&&typeof r.reportedFacilities.raw==='string'&&typeof r.processingDateRaw==='string'&&Array.isArray(r.flags));
  if(nativeRequired)check(r.csvSha256===e.rawCsv.sha256);
 }
 return e;
}

function derive(snapshot,nativeRequired){
 const e=validate(snapshot,nativeRequired),groups=new Map(snapshot.groups.map(g=>[g.chainId,g])),rows=snapshot.rows.map(r=>{
  const id=r.chainId.status==='lexically-valid'?r.chainId.raw:null;
  const group=id===null?null:groups.get(id);check(id===null||group);
  return {
   assertionId:`${r.csvSha256}:${r.sourceRow}`,
   recordUnit:'publisher-reported-chain-affiliation-assertion',
   lineage:{manifestPath:e.manifestPath??null,manifestSha256:e.manifestSha256??null,selectedArtifactPath:e.selectedArtifact?.path??null,selectedArtifactSha256:e.selectedArtifact?.sha256??null,selectedArtifactRows:e.selectedArtifact?.rows??null,sourceRunId:e.failedSource?.runId??null,rawCsvPath:e.rawCsv?.path??null,rawCsvSha256:r.csvSha256,sourceRow:r.sourceRow,sourceRecordId:r.sourceRecordId,ccn:r.identifier.value},
   temporal:{publisherProcessingDateRaw:r.processingDateRaw,sourceDates:e.sourceDates??null,observedAt:e.observedAt??null,sourceFailedAt:e.sourceFailedAt??null,recoveryCreatedAt:e.recoveryCreatedAt??null,validFrom:null,validTo:null,firstSeen:null,lastSeen:null},
   chainName:{raw:r.chainName.raw,status:r.chainName.status,controlCharactersObserved:r.chainName.controlCharactersObserved},
   chainId:{raw:r.chainId.raw,status:r.chainId.status,type:r.chainId.type,controlCharactersObserved:r.chainId.controlCharactersObserved},
   reportedFacilities:{raw:r.reportedFacilities.raw,status:r.reportedFacilities.status,value:r.reportedFacilities.value,controlCharactersObserved:r.reportedFacilities.controlCharactersObserved},
   retainedGroupEvidence:group?{memberRows:group.memberRows,rawNames:group.rawNames,reportedFacilityCounts:group.reportedFacilityCounts,missingCountRows:group.missingCountRows,invalidCountRows:group.invalidCountRows,nameVariantCount:group.nameVariantCount,reportedCountReconciliation:group.reportedCountReconciliation}:null,
   flags:[...r.flags],
  };
 });
 const summary={assertionRows:rows.length,sourceRows:snapshot.summary.directoryRows,rowsWithLexicallyValidChainId:snapshot.summary.rowsWithLexicallyValidChainId,rowsMissingChainId:snapshot.summary.rowsMissingChainId,rowsUnresolvedChainId:snapshot.summary.rowsUnresolvedChainId,publisherGroupIds:snapshot.summary.publisherGroupIds,groupsMatchingReportedCount:snapshot.summary.groupsMatchingReportedCount,rowsWithFlags:snapshot.summary.rowsWithFlags,conservation:{assertionRowsEqualSourceRows:rows.length===snapshot.rows.length,chainIdStatusesSumToSourceRows:snapshot.summary.rowsWithLexicallyValidChainId+snapshot.summary.rowsMissingChainId+snapshot.summary.rowsUnresolvedChainId===snapshot.rows.length}};
 check(summary.conservation.assertionRowsEqualSourceRows&&summary.conservation.chainIdStatusesSumToSourceRows);
 const view=freeze({schemaVersion:VERSION,sourceSchemaVersion:INPUT_VERSION,verificationMode:snapshot.verificationMode,nativeSourceVerified:nativeRequired,evidence:e,rows,summary,claims:{recordUnit:'publisher-reported-chain-affiliation-assertion',publisherReportedAffiliation:true,affiliationMeaning:'shared-owner-officer-or-operational-managerial-control-as-reported-by-publisher',legalParentVerified:false,canonicalNetworkVerified:false,healthcareNetworkVerified:false,uniqueBusinessCountVerified:false,physicalSiteVerified:false,currentOperationsVerified:false,publicExportAuthorized:false,exportPolicy:'local-review-only',productionReportingModified:false,publiclyExposed:false,artifactPersisted:false}});
 assertionViews.add(view);return view;
}

/** Build a read-only local assertion view by replaying the fixed retained release. */
export async function loadCmsNursingHomeChainAssertions(options={}){
 check(safeObject(options)&&Reflect.ownKeys(options).every(k=>k==='signal')&&(options.signal===undefined||options.signal instanceof AbortSignal));
 const input=await loadCmsNursingHomeChainReportingInput(options);return derive(input,true);
}

/** Synthetic-only transformation seam for tests; never creates native evidence. */
export async function cmsNursingHomeChainAssertionsFixture(raw,selected,options={}){
 const input=await cmsNursingHomeChainFixture(raw,selected,options);return derive(input,false);
}

/** Return a bounded local page; omitted filters preserve source order. */
export function pageCmsNursingHomeChainAssertions(assertions,options={}){
 check(safeObject(assertions)&&assertions.schemaVersion===VERSION&&Object.isFrozen(assertions)&&assertionViews.has(assertions)&&safeObject(options));
 check(Reflect.ownKeys(options).every(k=>['chainId','ccn','offset','limit'].includes(k)));
 const {chainId,ccn,offset=0,limit=100}=options;
 check(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500);
 check(chainId===undefined||typeof chainId==='string'&&chainId.length<=4096);
 check(ccn===undefined||typeof ccn==='string'&&/^[A-Za-z0-9]{6}$/.test(ccn));
 const filtered=assertions.rows.filter(r=>(chainId===undefined||r.chainId.raw===chainId)&&(ccn===undefined||r.lineage.ccn===ccn));
 return freeze({schemaVersion:VERSION,offset,limit,total:filtered.length,rows:filtered.slice(offset,offset+limit),exportPolicy:'local-review-only'});
}
