'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadRunnerArtifact, runnerJson } from './runner-client';
import RefreshSchedules from './refresh-schedules';
import ProductionRuns from './production-runs';
import OvertureNormalization from './overture-normalization';
import OvertureReadiness from './overture-readiness';
import CmsHospitalAdoption from './cms-hospital-adoption';
import CmsNursingHomeChainReview from './cms-nursing-home-chain-review';
import CmsSnfPecosStatusCard, {type CmsSnfPecosStatus} from './cms-snf-pecos-status';
import IaBusinessRegistryRefreshStatusCard, {type IaBusinessRegistryRefreshStatus} from './ia-business-registry-refresh-status';
import OrBusinessRegistryRefreshStatusCard, {type OrBusinessRegistryRefreshStatus} from './or-business-registry-refresh-status';
import NyBusinessRegistryRefreshStatusCard, {type NyBusinessRegistryRefreshStatus} from './ny-business-registry-refresh-status';
import RetainedBusinessRefreshStatusCard, {type RetainedBusinessRefreshStatus} from './retained-business-refresh-status';
import BroadOrganizationAuthorizationPacket from './broad-organization-authorization-packet';
import BroadOrganizationAuthorizationProgram from './broad-organization-authorization-program';
import BroadOrganizationCurrentAuthorizationChain from './broad-organization-current-authorization-chain';
import DocumentOnlyInquiryProposalRegistry from './document-only-inquiry-proposal-registry';
import NationalGeographyGoalStatus from './national-geography-goal-status';
import ReportedOrganizationZipEvidenceStatus from './reported-organization-zip-evidence-status';
import ZipDenominatorDeltaReview from './zip-denominator-delta-review';
import NationalPharmacyIndustryCoverageStatus from './national-pharmacy-industry-coverage-status';
import NationalSnapRetailerIndustryCoverageStatus from './national-snap-retailer-industry-coverage-status';
import NationalFmcsaRegistrantPrincipalOfficeCoverageStatus from './national-fmcsa-registrant-principal-office-coverage-status';
import NationalFdicBankfindCoverageStatus from './national-fdic-bankfind-coverage-status';
import NationalNcuaCreditUnionCoverageStatus from './national-ncua-credit-union-coverage-status';
import NationalFsisActiveEstablishmentCoverageStatus from './national-fsis-active-establishment-coverage-status';
import NationalEpaEchoActiveFacilityCoverageStatus from './national-epa-echo-active-facility-coverage-status';
import NationalIrsEoBmfOrganizationCoverageStatus from './national-irs-eo-bmf-organization-coverage-status';
import NationalCmsNppesOrganizationPracticeLocationCoverageStatus from './national-cms-nppes-organization-practice-location-coverage-status';
import IllinoisBroadOrganizationAdmissionReadiness from './illinois-broad-organization-admission-readiness';
import { operationLabel, operationEvidence, type Operation } from './data-operation-model';

type Catalog = {
  industries: Array<{ id: string; label?: string }>;
  states: string[];
  collectionSources?: Array<{ id: string; scope: 'national'|'state'; states: string[] | 'all'; industries: string[]; manualSelectionRequired: boolean }>;
  automaticRefreshSources?:Array<{sourceId:string;script:string;automaticRefreshAuthorized:boolean;reasonCode:'AUTOMATIC_REFRESH_NOT_REVIEWED'|'GOVERNED_SOURCE_HOLD'|'MANUAL_SELECTION_REQUIRED';governedSourceId:string|null}>;
  export: { categories: string[]; fields: string[]; formats: string[]; policyModes: string[] };
  credentialExport?:{exportType:string;fields:string[];requiredFields:string[];formats:string[];policyModes:string[];recordUnit:string};
  retainedSourceAdoptions?:Array<{sourceId:string;action:string}>;
  governedSourceServices?:Array<CmsSnfPecosStatus|IaBusinessRegistryRefreshStatus|OrBusinessRegistryRefreshStatus|NyBusinessRegistryRefreshStatus|RetainedBusinessRefreshStatus>;
};
type Plan = {
  taskCount: number; maxConcurrency: number; warnings: string[];
  tasks: Array<{ id: string; sourceId: string; scope: string; state?: string }>;
  gaps: Array<{ industry: string; state: string; reason: string }>;
};
type MaintenanceView = { industries: Array<{id:string;label:string}>; maintainedIndustries:string[]; revision:number; semantics:string };
const base = '/api/data-operations';
const active = (status: string) => ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(status);
const label = (text: string) => text.replaceAll('-', ' ').replaceAll('_', ' ');
const initialFields = ['business_name', 'street', 'city', 'state', 'zip_code', 'zip4', 'latitude', 'longitude'];
const selectedValues = (element: HTMLSelectElement) => Array.from(element.selectedOptions, (option) => option.value);
export const maintenancePlanningDefault = (catalogIds:string[], maintainedIds:string[]) => maintainedIds.filter((id,index) => catalogIds.includes(id) && maintainedIds.indexOf(id) === index);

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  return runnerJson<T>(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export default function DataOperations() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [category, setCategory] = useState('');
  const [exportStates, setExportStates] = useState<string[]>([]);
  const [fields, setFields] = useState(initialFields);
  const [format, setFormat] = useState('both');
  const [policyMode, setPolicyMode] = useState('public-only');
  const [exportType,setExportType]=useState('business');
  const [credentialFields,setCredentialFields]=useState(['business_name_source','reported_city','reported_zip5','reported_zip4']);
  const [organizationZip5,setOrganizationZip5]=useState('');
  const [organizationPublisher,setOrganizationPublisher]=useState('');
  const [organizationPolicy,setOrganizationPolicy]=useState<'public-only'|'local-review'>('public-only');
  const [organizationFormat,setOrganizationFormat]=useState('both');
  const [uspsPackageDirectory,setUspsPackageDirectory]=useState('');
  const [dcCorporateSelection,setDcCorporateSelection]=useState('');
  const [illinoisBusinessSelection,setIllinoisBusinessSelection]=useState('');
  const [utahBusinessSelection,setUtahBusinessSelection]=useState('');
  const [oklahomaBusinessSelection,setOklahomaBusinessSelection]=useState('');
  const [mississippiBusinessPackage,setMississippiBusinessPackage]=useState('');
  const [kentuckyBusinessPackage,setKentuckyBusinessPackage]=useState('');
  const credentialMode=exportType==='mn-construction-credentials';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [maintenanceError,setMaintenanceError]=useState('');
  const [maintenanceIndustries,setMaintenanceIndustries]=useState<string[]|null>(null);
  const maintenanceLoaded=useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const [nextCatalog, history] = await Promise.all([
          runnerJson<Catalog>(`${base}/catalog`, { signal: controller.signal }),
          runnerJson<Operation[]>(`${base}/operations`, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setCatalog(nextCatalog); setOperations(history); setConnectionError('');
          if(!maintenanceLoaded.current){
            maintenanceLoaded.current=true;
            try{
              const maintenance=await runnerJson<MaintenanceView>('/api/administration/industries',{signal:controller.signal});
              if(!controller.signal.aborted){const defaults=maintenancePlanningDefault(nextCatalog.industries.map(item=>item.id),maintenance.maintainedIndustries);setIndustries(defaults);setMaintenanceIndustries(defaults);setMaintenanceError('');}
            }catch{if(!controller.signal.aborted){setIndustries([]);setMaintenanceIndustries(null);setMaintenanceError('Maintenance selection is unavailable; no industries were selected by default.');}}
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) setConnectionError(reason instanceof Error ? reason.message : 'Unable to reach data operations.');
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const locked = operations.some((operation) => active(operation.status));
  const act = async (action: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed.'); }
    finally { setBusy(false); }
  };
  const remember = (operation: Operation) => setOperations((items) => [operation, ...items.filter((item) => item.id !== operation.id)]);
  const collectionInput = { industries, states, ...(sourceIds.length ? { sourceIds: Array.from(new Set(sourceIds)) } : {}) };
  const collectionSources = industries.length ? (catalog?.collectionSources?.filter(source => source.industries.some(item=>industries.includes(item))
    && (!states.length || source.states === 'all' || states.some(state => source.states.includes(state)))) ?? []) : [];

  return <section id="data-operations" className="panel data-operations">
    <div className="panel-heading"><div><span className="section-kicker">Collect · compile · extract</span><h2>Data operations</h2></div><span className="operations-local">Runs locally · no AI required</span></div>
    {(error || connectionError) && <p className="operations-error" role="alert">{error || connectionError}</p>}
    <div className="operations-builders">
      <section aria-labelledby="collection-title" className="operations-builder">
        <h3 id="collection-title">Update an industry</h3>
        <label>Industries selected for this plan<select aria-label="Collection industries" multiple size={6} value={industries} disabled={!catalog || busy} onChange={(event) => { setIndustries(selectedValues(event.currentTarget)); setSourceIds([]); setPlan(null); }}>{catalog?.industries.map((item) => <option key={item.id} value={item.id}>{item.label ?? label(item.id)}</option>)}</select></label>
        <p className="operations-note">Initialized once from Administration maintenance intent. This is an explicit plan selection, not authorization, coverage, scheduling, or dispatch. An empty maintenance selection stays empty.</p>
        {maintenanceError&&<p className="operations-note" role="status">{maintenanceError}</p>}
        <label>Publisher states<select multiple size={5} value={states} disabled={!catalog || busy} onChange={(event) => { setStates(selectedValues(event.currentTarget)); setSourceIds([]); setPlan(null); }}>{catalog?.states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <p className="operations-note">No state selection means all states. Hold Ctrl or Command to select several. State publishers may include out-of-state premises; national sources are acquired once in full.</p>
        <label>Collection sources<select multiple size={6} value={sourceIds} disabled={!catalog || busy} onChange={(event) => { setSourceIds(Array.from(new Set(selectedValues(event.currentTarget)))); setPlan(null); }} aria-describedby="collection-source-guidance">{collectionSources.map(source => <option key={source.id} value={source.id}>{label(source.id)}{source.manualSelectionRequired ? ' (manual-only)' : ''}</option>)}</select></label>
        <div className="operations-actions"><button type="button" className="ghost-button" disabled={!catalog || busy || !collectionSources.length} onClick={() => { setSourceIds(collectionSources.map(source => source.id)); setPlan(null); }}>Select all matching sources</button><button type="button" className="ghost-button" disabled={!sourceIds.length || busy} onClick={() => { setSourceIds([]); setPlan(null); }}>Clear selected sources</button></div>
        <p id="collection-source-guidance" className="operations-note">{sourceIds.length ? `Selected ${sourceIds.length} source${sourceIds.length === 1 ? '' : 's'}: ${collectionSources.filter(source => sourceIds.includes(source.id)).map(source => label(source.id)).join(', ')}.` : 'No selected sources means use default sources only.'} Manual-only sources are excluded from default runs. Selecting a source does not grant approval or bypass its checks.</p>
        <div className="operations-actions"><button className="ghost-button" disabled={!catalog || busy || !industries.length} onClick={() => void act(async () => setPlan(await post<Plan>('/plan', collectionInput)))}>Preview collection</button><button className="primary-button" disabled={!plan?.taskCount || locked || busy || !!connectionError || !industries.length} onClick={() => void act(async () => remember(await post<Operation>('/collections', collectionInput)))}>Start collection</button></div>
        {plan && <div className="operations-plan" aria-live="polite">
          <strong>{plan.taskCount} source updates · up to {Math.min(plan.taskCount, plan.maxConcurrency)} parallel workers; remaining tasks wait in this operation</strong>
          <ul>{plan.tasks.map((task) => <li key={task.id}>{label(task.sourceId)} <span>({task.state ?? 'national'})</span></li>)}</ul>
          {plan.warnings.map((warning) => <p key={warning} className="operations-note">{warning}</p>)}
          {!!plan.gaps.length && <details><summary>{plan.gaps.length} industry/state collection gaps</summary><ul>{plan.gaps.map((gap) => <li key={`${gap.industry}-${gap.state}`}>{gap.state} · {label(gap.industry)} — {gap.reason}</li>)}</ul></details>}
          <p className="operations-note">New source releases are preserved separately. They appear in national comparisons after reconciliation.</p>
        </div>}
      </section>
      <section aria-labelledby="export-title" className="operations-builder">
        <h3 id="export-title">Build a flat file</h3>
        <label>Record type<select value={exportType} disabled={!catalog||busy} onChange={event=>{setExportType(event.target.value);setCategory('');setExportStates([]);setFormat('both');setPolicyMode(event.target.value==='business'?'public-only':'local-review-only');}}><option value="business">Business source profiles</option>{catalog?.credentialExport&&<option value="mn-construction-credentials">Minnesota construction credentials</option>}</select></label>
        {!credentialMode&&<label>Business category<select value={category} disabled={!catalog || busy} onChange={(event) => setCategory(event.target.value)}><option value="">All profile categories</option>{catalog?.export.categories.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>}
        <label>{credentialMode?'Credential reported address states':'Business address states'}<select multiple size={5} value={exportStates} disabled={!catalog || busy} onChange={(event) => setExportStates(selectedValues(event.currentTarget))}>{catalog?.states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <p className="operations-note">{credentialMode?'No selection includes all reported states, including unresolved/out-of-scope addresses. State filters use reported addresses, not publisher jurisdiction or physical locations. Only the reviewed retained residential license cohort is included.':'No selection means all states. Exports use the current reconciled registry and preserve separate source records.'}</p>
        <fieldset className="operations-fields"><legend>Columns</legend>{(credentialMode?catalog?.credentialExport?.fields:catalog?.export.fields)?.map((field) => {const required=credentialMode&&catalog?.credentialExport?.requiredFields.includes(field);return <label key={field}><input type="checkbox" checked={Boolean(required)||(credentialMode?credentialFields:fields).includes(field)} disabled={busy||Boolean(required)} onChange={(event) => (credentialMode?setCredentialFields:setFields)((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />{label(field)}{required?' (required)':''}</label>;})}</fieldset>
        <p className="operations-note">{credentialMode?'Required credential identity and provenance columns are automatic. Source dates and unknowns are preserved; ZIP5 and ZIP4 stay separate. No coordinates, business polygons, contact fields or verified operating-site claims are added.':'Record provenance is always included. ZIP5 and ZIP+4 stay separate. Business geography uses address latitude and longitude only.'}</p>
        <div className="operations-options"><label>Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="both">CSV and JSONL</option><option value="csv">CSV</option><option value="jsonl">JSONL</option></select></label><label>Use mode<select value={credentialMode?'local-review-only':policyMode} disabled={credentialMode} onChange={(event) => setPolicyMode(event.target.value)}>{credentialMode?<option value="local-review-only">Local review only — locked</option>:<><option value="public-only">Public record policies only</option><option value="local-review">Local review</option></>}</select></label></div>
        <p className="operations-note">{credentialMode?'Credential files remain local-review-only. Publication in a national reporting layer does not authorize public redistribution. This operation reads retained evidence; it does not acquire source data.':'Local review includes records approved for local inspection. Unknown or prohibited policies are excluded. Building a file does not publish it.'}</p>
        <button className="primary-button" disabled={!catalog || (!credentialMode&&!fields.length) || locked || busy || !!connectionError} onClick={() => void act(async () => remember(await post<Operation>('/exports', credentialMode?{exportType:'mn-construction-credentials',states:exportStates,fields:credentialFields,format,policyMode:'local-review-only'}:{ categories: category ? [category] : [], states: exportStates, fields, format, policyMode })))}>{credentialMode?'Build credential file':'Build file'}</button>
      </section>
    </div>
    <section aria-labelledby="organization-zip-export-title" className="operations-builder">
      <h3 id="organization-zip-export-title">Export retained organization ZIP evidence</h3>
      <p className="operations-note">A separate, fixed-release export of source-reported administrative organization or registration addresses at one exact ZIP5. It is not a map layer, physical-site list, current-operation claim, or business/site total. The source release is retained locally; this operation does not acquire data.</p>
      <div className="operations-options">
        <label>Exact ZIP5 <input aria-label="Organization evidence exact ZIP5" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={organizationZip5} disabled={busy} onChange={event=>setOrganizationZip5(event.target.value)}/></label>
        <label>Publisher jurisdiction <select aria-label="Organization evidence publisher" value={organizationPublisher} disabled={busy} onChange={event=>setOrganizationPublisher(event.target.value)}><option value="">All fixed publishers</option>{['CO','CT','DE','FL','IA','NY','OR','PA'].map(state=><option key={state} value={state}>{state}</option>)}</select></label>
        <label>Policy mode <select aria-label="Organization evidence policy" value={organizationPolicy} disabled={busy} onChange={event=>setOrganizationPolicy(event.target.value as 'public-only'|'local-review')}><option value="public-only">Public-only · omit Delaware details</option><option value="local-review">Local review · restricted Delaware details included</option></select></label>
        <label>Format <select aria-label="Organization evidence format" value={organizationFormat} disabled={busy} onChange={event=>setOrganizationFormat(event.target.value)}><option value="both">CSV and JSONL</option><option value="csv">CSV</option><option value="jsonl">JSONL</option></select></label>
      </div>
      <button type="button" className="primary-button" disabled={!catalog||!/^\d{5}$/.test(organizationZip5)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/organization-zip-evidence-exports',{zip5:organizationZip5,...(organizationPublisher?{publisher_state:organizationPublisher}:{}),policy_mode:organizationPolicy,format:organizationFormat})))}>Build verified organization ZIP export</button>
      <p className="operations-note">Public-only omits Delaware record-level details while its policy-excluded count remains reported as neither missing nor zero evidence. Choose local review only where that restricted detail is appropriate.</p>
    </section>
    <section aria-labelledby="usps-city-state-admission-title" className="operations-builder">
      <h3 id="usps-city-state-admission-title">Inspect a licensed USPS City State package</h3>
      <p className="operations-note">Offline local admission only. Co*Tive does not obtain or grant a USPS license. The approval registries are intentionally empty, so packages fail closed until authorization and projection evidence receive a separate governed review.</p>
      <label>Package directory under data/imports <input aria-label="USPS City State package directory" value={uspsPackageDirectory} disabled={busy} placeholder="data/imports/usps-city-state-package" onChange={event=>setUspsPackageDirectory(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data[\\/]imports[\\/][^\\/]+(?:[\\/][^\\/]+)*$/.test(uspsPackageDirectory)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/usps-city-state-admissions',{packageDirectory:uspsPackageDirectory})))}>Start offline package inspection</button>
      <p className="operations-note">Success remains local-restricted, candidate-only, pointer-free, non-production, and makes no address-deliverability or ZIP/ZCTA claim.</p>
    </section>
    <section aria-labelledby="dc-corporate-registration-title" className="operations-builder">
      <h3 id="dc-corporate-registration-title">Process a D.C. Corporate Registration package</h3>
      <p className="operations-note">Zero-network, offline processing of one explicitly selected local package. The result remains local-review-only, creates no current pointer, and is not admitted to national coverage.</p>
      <label>Package selection under data/imports <input aria-label="D.C. Corporate Registration package selection" value={dcCorporateSelection} disabled={busy} placeholder="data/imports/dc-corporate-registration/packages/package-id/selection.json" onChange={event=>setDcCorporateSelection(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/dc-corporate-registration\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/selection\.json$/.test(dcCorporateSelection)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/dc-corporate-registration',{selection:dcCorporateSelection})))}>Start offline D.C. package operation</button>
      <p className="operations-note">Status, errors, cancellation, receipts, and any declared artifacts appear in Operation history below.</p>
    </section>
    <section aria-labelledby="illinois-business-registry-title" className="operations-builder">
      <h3 id="illinois-business-registry-title">Process an Illinois Business Registry package</h3>
      <p className="operations-note">Zero-network, offline processing of one explicitly selected local package. Supply all five official corporation and LLC files from the same daily run. The result remains local-review-only, creates no current pointer, and is not admitted to the national registry or broad-layer coverage.</p>
      <label>Package selection under data/imports <input aria-label="Illinois Business Registry package selection" value={illinoisBusinessSelection} disabled={busy} placeholder="data/imports/illinois-business-registry/packages/package-id/selection.json" onChange={event=>setIllinoisBusinessSelection(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/illinois-business-registry\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/selection\.json$/.test(illinoisBusinessSelection)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/illinois-business-registry',{selection:illinoisBusinessSelection})))}>Start offline Illinois package operation</button>
      <p className="operations-note">Status, errors, cancellation, receipts, and any declared artifacts use the shared Operation history below.</p>
    </section>
    <section aria-labelledby="utah-business-list-title" className="operations-builder">
      <h3 id="utah-business-list-title">Process a Utah Business List package</h3>
      <p className="operations-note">Zero-network, offline processing of one operator-supplied local package. The original workbook and all three derived JSONL sheets must be present in the selected package. The output remains local-review-only and on HOLD: it is not source-native, its authenticity and reproducible extraction are not verified, and it is not admitted to national coverage.</p>
      <label>Package selection under data/imports <input aria-label="Utah Business List package selection" value={utahBusinessSelection} disabled={busy} placeholder="data/imports/utah-business-list/packages/package-id/selection.json" onChange={event=>setUtahBusinessSelection(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/utah-business-list\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/selection\.json$/.test(utahBusinessSelection)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/ut-business-list',{selection:utahBusinessSelection})))}>Start offline Utah package operation</button>
      <p className="operations-note">This operation performs no acquisition or purchase. Durable status, errors, cancellation, and restart-persistent history appear in shared Operation history below. Terminal receipts and private evidence remain retained locally for governed inspection; they are not offered as downloadable artifacts.</p>
    </section>
    <section aria-labelledby="oklahoma-business-bulk-title" className="operations-builder">
      <h3 id="oklahoma-business-bulk-title">Process an Oklahoma Business Bulk package</h3>
      <p className="operations-note">Zero-network, offline processing of one operator-supplied local package containing the official bulk text file. The result is administrative organization-address evidence only: it is not a physical-site list or proof of current operation, remains local-review-only and on HOLD, and is not admitted to national coverage.</p>
      <label>Package selection under data/imports <input aria-label="Oklahoma Business Bulk package selection" value={oklahomaBusinessSelection} disabled={busy} placeholder="data/imports/oklahoma-business-bulk/packages/package-id/selection.json" onChange={event=>setOklahomaBusinessSelection(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/oklahoma-business-bulk\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/selection\.json$/.test(oklahomaBusinessSelection)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/ok-business-bulk',{selection:oklahomaBusinessSelection})))}>Start offline Oklahoma package operation</button>
      <p className="operations-note">This operation performs no acquisition, purchase, or account action. Durable status, errors, cancellation, and restart-persistent history appear in shared Operation history below. Terminal receipts and private evidence remain retained locally for governed inspection; they are not offered as downloadable artifacts.</p>
    </section>
    <section aria-labelledby="mississippi-business-report-title" className="operations-builder">
      <h3 id="mississippi-business-report-title">Process a Mississippi Business Report package</h3>
      <p className="operations-note">Zero-network replay of one operator-supplied local package containing the original workbook, strict derived JSONL, and selection envelope. Co*Tive retains an operation-owned snapshot and independently replays it. Output remains local-review-only and makes no statewide-completeness, current-operation, geocode, physical-site, public-export, pointer, or national-admission claim.</p>
      <label>Package directory under data/imports <input aria-label="Mississippi Business Report package" value={mississippiBusinessPackage} disabled={busy} placeholder="data/imports/mississippi-business-report/packages/package-id" onChange={event=>setMississippiBusinessPackage(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/mississippi-business-report\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(mississippiBusinessPackage)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/ms-business-report',{package:mississippiBusinessPackage})))}>Start offline Mississippi package operation</button>
      <p className="operations-note">The public report’s 300,000-row ceiling remains a truncation warning, never evidence of statewide completeness. Private receipts and releases stay inside datahub and are not download artifacts.</p>
    </section>
    <section aria-labelledby="kentucky-business-entity-title" className="operations-builder">
      <h3 id="kentucky-business-entity-title">Process a Kentucky Business Entity package</h3>
      <p className="operations-note">Zero-network replay of one operator-supplied local company-family package. Officer files are forbidden. Co*Tive retains an immutable operation snapshot and independently replays the strict 42-field input into private local-review evidence.</p>
      <label>Package directory under data/imports <input aria-label="Kentucky Business Entity package" value={kentuckyBusinessPackage} disabled={busy} placeholder="data/imports/kentucky-business-entity-bulk/packages/package-id" onChange={event=>setKentuckyBusinessPackage(event.target.value)}/></label>
      <button type="button" className="primary-button" disabled={!catalog||!/^data\/imports\/kentucky-business-entity-bulk\/packages\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(kentuckyBusinessPackage)||locked||busy||!!connectionError} onClick={()=>void act(async()=>remember(await post<Operation>('/ky-business-entity',{package:kentuckyBusinessPackage})))}>Start offline Kentucky package operation</button>
      <p className="operations-note">ZIP5 and ZIP4 stay separate. Output makes no statewide-completeness, current-operation, geocode, physical-site, public-export, pointer, or national-admission claim.</p>
    </section>
    <BroadOrganizationAuthorizationPacket />
    <BroadOrganizationAuthorizationProgram />
    <BroadOrganizationCurrentAuthorizationChain />
    <IllinoisBroadOrganizationAdmissionReadiness />
    <DocumentOnlyInquiryProposalRegistry />
    <NationalGeographyGoalStatus />
    <ReportedOrganizationZipEvidenceStatus />
    <ZipDenominatorDeltaReview />
    <NationalPharmacyIndustryCoverageStatus />
    <NationalSnapRetailerIndustryCoverageStatus />
    <NationalFmcsaRegistrantPrincipalOfficeCoverageStatus />
    <NationalFdicBankfindCoverageStatus />
    <NationalNcuaCreditUnionCoverageStatus />
    <NationalFsisActiveEstablishmentCoverageStatus />
    <NationalEpaEchoActiveFacilityCoverageStatus />
    <NationalIrsEoBmfOrganizationCoverageStatus />
    <NationalCmsNppesOrganizationPracticeLocationCoverageStatus />
    <RefreshSchedules catalog={catalog} administrationIndustries={maintenanceIndustries} administrationUnavailable={!!maintenanceError} />
    {catalog?.retainedSourceAdoptions?.some(source=>source.sourceId==='cms-hospital-general-information')&&<CmsHospitalAdoption operations={operations} disabled={locked||busy||!!connectionError} onInspect={()=>void act(async()=>remember(await post<Operation>('/source-adoptions',{sourceId:'cms-hospital-general-information'})))}/>}
    {catalog?.retainedSourceAdoptions?.some(source=>source.sourceId==='cms-nursing-home-provider-information')&&<CmsHospitalAdoption sourceId="cms-nursing-home-provider-information" operations={operations} disabled={locked||busy||!!connectionError} onInspect={()=>void act(async()=>remember(await post<Operation>('/source-adoptions',{sourceId:'cms-nursing-home-provider-information'})))}/>}
    <CmsNursingHomeChainReview />
    <CmsSnfPecosStatusCard status={catalog?.governedSourceServices?.find((source):source is CmsSnfPecosStatus=>source.sourceId==='cms-snf-pecos')}/>
    <IaBusinessRegistryRefreshStatusCard status={catalog?.governedSourceServices?.find((source):source is IaBusinessRegistryRefreshStatus=>source.sourceId==='ia-business-registry')}/>
    <OrBusinessRegistryRefreshStatusCard status={catalog?.governedSourceServices?.find((source):source is OrBusinessRegistryRefreshStatus=>source.sourceId==='or-business-registry')}/>
    <NyBusinessRegistryRefreshStatusCard status={catalog?.governedSourceServices?.find((source):source is NyBusinessRegistryRefreshStatus=>source.sourceId==='ny-business-registry')}/>
    {catalog?.governedSourceServices?.filter((source):source is RetainedBusinessRefreshStatus=>['co-business-registry','ct-business-registry','de-business-licenses','fl-business-registry','pa-business-registry'].includes(source.sourceId)).map(status=><RetainedBusinessRefreshStatusCard key={status.sourceId} status={status}/>)}
    <OvertureReadiness />
    <OvertureNormalization operations={operations} disabled={locked || busy || !!connectionError || !catalog} onOperation={remember} />
    <ProductionRuns />
    <section className="operations-history" aria-labelledby="operations-history-title"><h3 id="operations-history-title">Operation history</h3>
      {locked && <p className="operations-note">An operation is active. Additional starts become available when it finishes.</p>}
      {!operations.length && <p className="operations-note">{catalog ? 'No managed operations yet. Preview a collection or build a file above.' : 'Connecting to the local runner…'}</p>}
      {operations.map((operation) => <article key={operation.id} className="operation-record">
        <div><strong>{operationLabel(operation.kind)}</strong><span className={`operation-status status-${operation.status.toLowerCase()}`}>{label(operation.status.toLowerCase())}</span><time dateTime={operation.createdAt}>{new Date(operation.createdAt).toLocaleString()}</time></div>
        <small>{operation.id}</small>
        {operation.result?.sourceId && <p>{label(operation.result.sourceId)}</p>}
        {operationEvidence(operation) && <p className="operations-note">{operationEvidence(operation)}</p>}
        {operation.status === 'SUCCEEDED' && operation.result?.normalizationReady === true && typeof operation.result.normalizedPlaces === 'number' && <p>{operation.result.normalizedPlaces.toLocaleString()} normalized source places · not a unique-business count</p>}
        {typeof operation.result?.rowsWritten === 'number' && <p>{operation.result.rowsWritten.toLocaleString()} exported records · {label(operation.result.policyMode ?? '')}</p>}
        {typeof operation.result?.credentialRowsWritten === 'number' && <p>{operation.result.credentialRowsWritten.toLocaleString()} credential rows · local review only · separate from business totals</p>}
        {operation.kind==='organization-zip-export'&&typeof operation.result?.organizationZipRowCount==='number'&&<p>{operation.result.organizationZipRowCount.toLocaleString()} verified administrative address rows at ZIP5 {operation.result.organizationZip5} · {operation.result.policyMode} · not site/business totals</p>}
        {typeof operation.result?.plan?.taskCount === 'number' && <p>{operation.result.plan.taskCount} source updates in the collection plan</p>}
        {!!operation.result?.tasks?.length && <ul className="operation-task-list">{operation.result.tasks.map((task) => <li key={task.task_id}><span>{label(task.source_id ?? task.task_id)} · {task.state ?? 'national'}</span><strong>{label(task.status)}</strong></li>)}</ul>}
        {operation.error && <p role="status">{operation.error}</p>}
        {operation.status === 'UNKNOWN' && <p className="operations-note">The earlier process could not be conclusively resolved. Its operation remains protected from duplicate execution.</p>}
        <div className="operations-actions">{['RUNNING', 'QUEUED'].includes(operation.status) && <button className="ghost-button" disabled={busy} onClick={() => void act(async () => remember(await post<Operation>(`/operations/${encodeURIComponent(operation.id)}/cancel`, {})))}>Cancel</button>}{operation.artifacts.map((artifact) => <button key={artifact.name} className="ghost-button" title={artifact.sha256 ? `Verified SHA-256: ${artifact.sha256}` : undefined} aria-label={artifact.sha256 ? `Download verified ${artifact.name}; SHA-256 ${artifact.sha256}` : `Download ${artifact.name}`} disabled={busy} onClick={() => void act(async () => { await downloadRunnerArtifact(`${base}/operations/${encodeURIComponent(operation.id)}/artifacts/${encodeURIComponent(artifact.name)}`, artifact.name); })}>Download {artifact.name} · {(artifact.bytes / 1024 / 1024).toFixed(1)} MB{artifact.sha256 ? ` · SHA ${artifact.sha256.slice(0,12)}` : ''}</button>)}</div>
      </article>)}
    </section>
  </section>;
}
