import { randomUUID } from 'node:crypto';
import { mkdir, lstat, link, unlink, statfs, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { assertMnConstructionSourceUseConfiguration, bindMnConstructionSourceUse } from './mn-construction-source-use.mjs';
import { captureMnConstructionNotices, MN_CONSTRUCTION_NOTICE_URLS } from './mn-construction-notices.mjs';
import { preflightMnConstruction, MN_CONSTRUCTION_EXPORTS } from './mn-construction-preflight.mjs';
import { buildMnConstructionAcquiredSelection } from './mn-construction-acquired-selection.mjs';
import { writeMnConstructionAcquisitionReceipt, verifyMnConstructionAcquisitionReceipt } from './mn-construction-acquisition-receipt.mjs';
import { withMnConstructionPublisherLock } from './mn-construction-publisher-lock.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as read, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';
import { createHash } from 'node:crypto';

const VERSION = 'mn-construction-app@1.0.0', PIN = 'cb66a6fac15593bb90bf7c81d723f2b5ab754b816b338209f6285efb79887240';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const check = (value, reason) => { if (!value) throw new Error(`Minnesota app rejected: ${reason}.`); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value,name));
const owned = (a,b) => a && b && b.isFile() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev && b.nlink === 1n;
const directoryOwned = (a,b) => a && b && b.isDirectory() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev;
function optionsOnly(options, allowed) { check(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key => allowed.includes(key)), 'options'); }
export function validateMnConstructionAppEnrollment(value) { check(hash(value) === PIN, 'enrollment drift'); return structuredClone(value); }
async function enrollment(signal) {
  assertMnConstructionSourceUseConfiguration();
  const value = validateMnConstructionAppEnrollment(await read(path.join(APP_ROOT,'config/mn-construction-app-enrollment.json'),30000,signal));
  check(hash(await read(path.join(APP_ROOT,value.source_use_policy),30000,signal)) === value.source_use_policy_sha256, 'retained policy drift'); return value;
}
function descriptor(directory, parent) {
  return { path: path.relative(directory,parent.receipt_path).replaceAll('\\','/'), sha256: parent.receipt_sha256,
    child_manifest_sha256: parent.manifest_sha256, counts: parent.counts };
}
function terminal(start, startHash, acquisition, lease, status, reason, finishedAt) {
  return { schema_version: VERSION, run_id: start.run_id, cohort: start.cohort, execution_mode: start.execution_mode, enrollment_sha256: PIN,
    start_sha256: startHash, status, reason, finished_at: finishedAt, acquisition, publisher_lease: lease,
    publisher_lock_released: status === 'SUCCEEDED' ? true : null, native_execution_independently_verified: false,
    source_authenticity_verified: false, public_export_authorized: false, national_reporting_integrated: false };
}

async function inspectJob(filename, { signal } = {}, candidate = false) {
  await enrollment(signal);
  const terminalName=candidate?'.receipt-candidate.json':'receipt.json';
  check(typeof filename === 'string' && path.basename(filename) === terminalName, 'terminal receipt path');
  const directory = path.dirname(filename), runId = path.basename(directory);
  check(uuid.test(runId) && path.basename(path.dirname(directory)) === 'jobs', 'job path');
  const startMeter={}, endMeter={}, start=await read(path.join(directory,'start.json'),20000,signal,startMeter), end=await read(filename,30000,signal,endMeter);
  check(keys(start,['schema_version','run_id','cohort','execution_mode','started_at','enrollment_sha256','industry_run_id'])
    && start.schema_version===VERSION && start.run_id===runId && ['registrations','residential'].includes(start.cohort)
    && ['fixed-native-fetch','injected-test-transport'].includes(start.execution_mode) && time(start.started_at) && start.enrollment_sha256===PIN
    && (start.industry_run_id===null || typeof start.industry_run_id==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(start.industry_run_id)), 'start evidence');
  check(['SUCCEEDED','FAILED','CANCELLED','BLOCKED'].includes(end.status) && time(end.finished_at) && end.finished_at>=start.started_at
    && same(end,terminal(start,startMeter.sha256,end.acquisition,end.publisher_lease,end.status,end.reason,end.finished_at)), 'terminal envelope');
  if(end.status==='SUCCEEDED') {
    check(end.reason===null && keys(end.acquisition,['path','sha256','child_manifest_sha256','counts'])
      && /^acquisitions\/[a-f0-9-]{36}\.json$/.test(end.acquisition.path), 'acquisition descriptor');
    const parent=await verifyMnConstructionAcquisitionReceipt(path.join(directory,end.acquisition.path),{signal}), evidence=parent.receipt.evidence;
    check(same(descriptor(directory,parent),end.acquisition) && parent.run_id===runId && parent.source_release_id===`${runId}-${start.cohort}`
      && evidence.transport.cohort===start.cohort && evidence.before_notices.started_at>=start.started_at && end.finished_at>=parent.receipt.created_at
      && path.dirname(path.dirname(evidence.bundle.manifest_path))===path.join(directory,'selected'), 'acquisition linkage');
    check(keys(end.publisher_lease,['schema_version','lease_id','run_id','cohort','publisher_budget','pid','acquired_at'])
      && end.publisher_lease.schema_version==='mn-construction-publisher-lock@1.0.0' && uuid.test(end.publisher_lease.lease_id)
      && end.publisher_lease.run_id===runId && end.publisher_lease.cohort===start.cohort && end.publisher_lease.publisher_budget==='mn-dli-construction'
      && Number.isSafeInteger(end.publisher_lease.pid) && end.publisher_lease.pid>0 && time(end.publisher_lease.acquired_at)
      && end.publisher_lease.acquired_at>=start.started_at && end.publisher_lease.acquired_at<=evidence.before_notices.started_at, 'publisher lease');
    const checkpoint=await read(path.join(directory,'acquisition-checkpoint.json'),20000,signal);
    check(same(checkpoint,{schema_version:VERSION,run_id:runId,acquisition:end.acquisition}), 'checkpoint linkage');
    check(same(await read(path.join(directory,'notices-before.json'),1000000,signal),evidence.before_notices)
      && same(await read(path.join(directory,'schema-preflight.json'),100000,signal),evidence.preflight), 'before-row evidence linkage');
    const roster=(await readdir(directory)).sort(), expected=['acquisitions','selected','start.json',terminalName,'notices-before.json','schema-preflight.json','acquisition-checkpoint.json'];
    if(roster.includes('publisher-wait.json')) {
      const wait=await read(path.join(directory,'publisher-wait.json'),10000,signal);
      check(same(wait,{schema_version:VERSION,run_id:runId,reason:'publisher-busy',maximum_wait_ms:900000}), 'wait evidence'); expected.push('publisher-wait.json');
    }
    check(same(roster,expected.sort()), 'job roster');
    const finalParent=await verifyMnConstructionAcquisitionReceipt(path.join(directory,end.acquisition.path),{signal});
    check(same(descriptor(directory,finalParent),end.acquisition), 'parent changed during verification');
  } else {
    check(end.reason===({CANCELLED:'job-cancelled',BLOCKED:'publisher-wait-expired',FAILED:'acquisition-or-finalization-failed'})[end.status], 'terminal failure reason');
    check(end.publisher_lease===null || keys(end.publisher_lease,['schema_version','lease_id','run_id','cohort','publisher_budget','pid','acquired_at'])
      && end.publisher_lease.schema_version==='mn-construction-publisher-lock@1.0.0' && uuid.test(end.publisher_lease.lease_id)
      && end.publisher_lease.run_id===runId && end.publisher_lease.cohort===start.cohort && end.publisher_lease.publisher_budget==='mn-dli-construction'
      && Number.isSafeInteger(end.publisher_lease.pid) && end.publisher_lease.pid>0 && time(end.publisher_lease.acquired_at), 'failed-job lease');
    if(end.acquisition!==null){check(keys(end.acquisition,['path','sha256','child_manifest_sha256','counts']) && /^acquisitions\/[a-f0-9-]{36}\.json$/.test(end.acquisition.path),'failed-job acquisition');
      const parent=await verifyMnConstructionAcquisitionReceipt(path.join(directory,end.acquisition.path),{signal});
      const evidence=parent.receipt.evidence;
      check(same(descriptor(directory,parent),end.acquisition) && parent.run_id===runId && parent.source_release_id===`${runId}-${start.cohort}`
        && evidence.transport.cohort===start.cohort && evidence.before_notices.started_at>=start.started_at && end.finished_at>=parent.receipt.created_at
        && path.dirname(path.dirname(evidence.bundle.manifest_path))===path.join(directory,'selected'),'retained failed-job acquisition');}
  }
  const finalStart={}, finalEnd={}; await read(path.join(directory,'start.json'),20000,signal,finalStart); await read(filename,30000,signal,finalEnd);
  check(finalStart.sha256===startMeter.sha256 && finalEnd.sha256===endMeter.sha256 && owned(startMeter.identity,finalStart.identity) && owned(endMeter.identity,finalEnd.identity), 'job receipts changed');
  return {status:end.status,run_id:runId,cohort:start.cohort,execution_mode:start.execution_mode,receipt_path:filename,receipt_sha256:endMeter.sha256,
    acquisition:end.acquisition,reason:end.reason,native_execution_independently_verified:false,public_export_authorized:false,national_reporting_integrated:false};
}

export async function verifyMnConstructionAppJob(filename, options={}) { optionsOnly(options,['signal']); return inspectJob(filename,options); }

async function run(options, mode) {
  const { cohort, signal, industryRunId=null, fetchImpl, sleep, logger=async()=>{}, publisherWaitMs=900000,
    outputRoot=path.join(APP_ROOT,'data/business-sources/mn-dli-construction/app') }=options;
  check(['registrations','residential'].includes(cohort) && typeof fetchImpl==='function' && typeof logger==='function'
    && (sleep===undefined || typeof sleep==='function') && (signal===undefined || signal instanceof AbortSignal)
    && (industryRunId===null || typeof industryRunId==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(industryRunId))
    && Number.isInteger(publisherWaitMs) && publisherWaitMs>=0 && publisherWaitMs<=900000, 'runtime configuration');
  signal?.throwIfAborted(); await enrollment(signal); await canonical(outputRoot,{output:true,signal});
  check(!path.relative(APP_ROOT,outputRoot).split(path.sep).some(segment=>segment.toLowerCase()==='jobs'), 'output inside job history');
  await canonical(outputRoot,{create:true,output:true,signal});
  const capacity=await statfs(outputRoot,{bigint:true});check(capacity.bavail*capacity.bsize>=1500000000n,'disk headroom before requests');
  const jobs=path.join(outputRoot,'jobs'); await canonical(jobs,{create:true,output:true,signal});
  const runId=randomUUID(), directory=path.join(jobs,runId); await mkdir(directory);
  const directoryOwner=await lstat(directory,{bigint:true}), owners=new Map(), storedHashes=new Map();
  let previous;
  const now=()=>{const at=new Date().toISOString();check(!previous||at>=previous,'clock regressed');previous=at;return new Date(at);};
  async function assertDirectory(){await canonical(directory);check(directoryOwned(directoryOwner,await lstat(directory,{bigint:true})),'job ownership changed');}
  async function store(name,value) {
    await assertDirectory();const temporary=path.join(directory,`${name}.tmp`), final=path.join(directory,name);let out;
    try { out=await writer(temporary,1000000,undefined,owners);await out.write(value);const d=await out.finish();
      const meter={};check(same(await read(temporary,1000000,undefined,meter),value) && meter.sha256===d.sha256 && owned(owners.get(temporary),meter.identity),'written job evidence');
      await assertDirectory();await link(temporary,final);owners.set(final,owners.get(temporary));storedHashes.set(final,d.sha256);await unlink(temporary);owners.delete(temporary);return d.sha256;
    } finally {await out?.close();}
  }
  const start={schema_version:VERSION,run_id:runId,cohort,execution_mode:mode,started_at:now().toISOString(),enrollment_sha256:PIN,industry_run_id:industryRunId};
  let startHash, acquisition=null, lease=null, waitStored=false, committed=false, waitExpired=false;
  try {
    startHash=await store('start.json',start);await logger('job-started');signal?.throwIfAborted();
    const waitStarted=performance.now();let gated;
    for(;;) {
      signal?.throwIfAborted();
      if(waitStored && performance.now()-waitStarted>=publisherWaitMs){waitExpired=true;throw new Error('Publisher wait expired.');}
      try {
        gated=await withMnConstructionPublisherLock({runId,cohort,signal},async({lease: held,assertHeld})=>{
          lease=held;
          const guardedFetch=async(url,settings)=>{
            check([...MN_CONSTRUCTION_NOTICE_URLS,...MN_CONSTRUCTION_EXPORTS].includes(url) && ['GET','HEAD'].includes(settings.method)
              && settings.redirect==='error' && settings.credentials==='omit','fixed request contract');
            await assertDirectory();await assertHeld();settings.signal?.throwIfAborted();return fetchImpl(url,settings);
          };
          const notices=await captureMnConstructionNotices({fetchImpl:guardedFetch,signal,now,...(sleep?{sleep}:{})});
          bindMnConstructionSourceUse(notices,{checkedAt:now().toISOString()});await store('notices-before.json',notices);await logger('notices-verified');signal?.throwIfAborted();
          // The two prerequisite modules each pace internally; retain spacing at their boundary too.
          if(sleep)await sleep(1000,{signal});else await delay(1000,undefined,{signal});
          const preflight=await preflightMnConstruction({fetchImpl:guardedFetch,signal,now,...(sleep?{sleep}:{})});
          await store('schema-preflight.json',preflight);await logger('schema-verified');signal?.throwIfAborted();
          const evidence=await buildMnConstructionAcquiredSelection({notices,preflight,context:{runId,sourceReleaseId:`${runId}-${cohort}`,observedAt:now().toISOString(),cohort},
            outputRoot:path.join(directory,'selected'),fetchImpl:guardedFetch,signal,now,...(sleep?{sleep}:{})});
          // No more requests after child commit. Preserve parent and checkpoint even on cancellation.
          const parent=await writeMnConstructionAcquisitionReceipt(evidence,{outputRoot:path.join(directory,'acquisitions')});
          acquisition=descriptor(directory,parent);await store('acquisition-checkpoint.json',{schema_version:VERSION,run_id:runId,acquisition});
          await logger('acquisition-persisted');signal?.throwIfAborted();return acquisition;
        }); break;
      } catch(error) {
        if(error.code!=='MN_PUBLISHER_BUSY')throw error;
        if(!waitStored){await store('publisher-wait.json',{schema_version:VERSION,run_id:runId,reason:'publisher-busy',maximum_wait_ms:900000});waitStored=true;}
        if(performance.now()-waitStarted>=publisherWaitMs){waitExpired=true;throw new Error('Publisher wait expired.');}
        await delay(Math.min(1000,publisherWaitMs-(performance.now()-waitStarted)),undefined,{signal});
      }
    }
    check(gated.lock_released && same(gated.result,acquisition),'publisher finalization');await logger('before-complete');signal?.throwIfAborted();
    // Validate retained parent immediately before terminal publication; no network.
    const parent=await verifyMnConstructionAcquisitionReceipt(path.join(directory,acquisition.path),{signal});check(same(descriptor(directory,parent),acquisition),'final parent changed');
    await store('.receipt-candidate.json',terminal(start,startHash,acquisition,lease,'SUCCEEDED',null,now().toISOString()));
    await inspectJob(path.join(directory,'.receipt-candidate.json'),{signal},true);
    for(const [file,expected] of storedHashes){const measured={};await read(file,1000000,signal,measured);check(measured.sha256===expected && owned(owners.get(file),measured.identity),'job evidence changed before commit');}
    await assertDirectory();signal?.throwIfAborted();
    await link(path.join(directory,'.receipt-candidate.json'),path.join(directory,'receipt.json'));committed=true;await unlink(path.join(directory,'.receipt-candidate.json'));
    return await verifyMnConstructionAppJob(path.join(directory,'receipt.json'));
  } catch {
    if(!committed && startHash) {
      const candidate=path.join(directory,'.receipt-candidate.json');
      try {await assertDirectory();if(owned(owners.get(candidate),await lstat(candidate,{bigint:true})))await unlink(candidate);}catch{/* Never remove foreign evidence. */}
      const status=signal?.aborted?'CANCELLED':waitExpired?'BLOCKED':'FAILED',reason=signal?.aborted?'job-cancelled':waitExpired?'publisher-wait-expired':'acquisition-or-finalization-failed';
      try {await store('receipt.json',terminal(start,startHash,acquisition,lease,status,reason,new Date().toISOString()));}catch{/* Preserve existing or foreign history. */}
    }
    throw Object.assign(new Error('Minnesota app job did not complete; inspect its retained operation receipt before any new acquisition.'),{run_id:runId,receipt_path:path.join(directory,'receipt.json')});
  }
}

export async function runMnConstructionAppJob(options={}) {
  optionsOnly(options,['cohort','outputRoot','signal','industryRunId']);
  return run({...options,fetchImpl:globalThis.fetch},'fixed-native-fetch');
}
export async function runMnConstructionAppJobWithTransport(options={}) {
  optionsOnly(options,['cohort','outputRoot','signal','industryRunId','fetchImpl','sleep','logger','publisherWaitMs']);
  return run(options,'injected-test-transport');
}
