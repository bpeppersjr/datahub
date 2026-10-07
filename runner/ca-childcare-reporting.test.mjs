import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {CA_CHILDCARE_RESOURCES,CA_CHILDCARE_SELECTED_FIELDS} from './ca-childcare-acquisition.mjs';
import {runCaChildcareAppWithTransport} from './ca-childcare-app.mjs';
import {summarizeCaChildcareAppReceipt} from './ca-childcare-reporting.mjs';

function transport(){return async url=>{const parsed=new URL(String(url)),id=parsed.searchParams.get('resource_id'),resource=CA_CHILDCARE_RESOURCES.find(row=>row.id===id),limit=Number(parsed.searchParams.get('limit')),offset=Number(parsed.searchParams.get('offset')??0);const records=limit===0?[]:Array.from({length:Math.min(500,resource.total-offset)},(_,index)=>Object.fromEntries(CA_CHILDCARE_SELECTED_FIELDS.map(key=>[key,key==='_id'?offset+index+1:key==='facility_state'?'CA':key==='facility_zip'?(index%3?'90001':'90001-1234'):key==='facility_status'?(index%2?'LICENSED':'CLOSED'):key==='file_date'?'05/25/2025':`${key}-${offset+index+1}`])));return new Response(JSON.stringify({success:true,result:{resource_id:id,...(limit===0?{total:resource.total,fields:[],records}:{records})}}),{headers:{'content-type':'application/json'}})}}

test('California reporting replays one complete app receipt and preserves conservative state and ZIP evidence',async()=>{const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ca-reporting-'));try{const job=await runCaChildcareAppWithTransport({outputRoot:path.join(root,'app'),fetchImpl:transport(),industryRunId:'ca-reporting-fixture'}),summary=await summarizeCaChildcareAppReceipt(job.receipt_path);assert.equal(summary.source_candidate_rows,39184);assert.equal(summary.accepted_candidate_rows,39184);assert.equal(summary.quarantined_candidate_rows,0);assert.equal(summary.by_reported_state.find(row=>row.state==='CA').candidate_rows,39184);assert.equal(summary.quality.with_zip5,39184);assert.ok(summary.quality.with_zip4>0);assert.equal(summary.quality.with_points,0);assert.equal(summary.claims.current_operations_verified,false);assert.equal(summary.claims.physical_site_verified,false);assert.equal(summary.claims.zcta_membership_verified,false);assert.equal(summary.claims.unique_active_business_count,null);assert.equal(summary.claims.national_completeness_percent,null)}finally{await rm(root,{recursive:true,force:true})}});

test('California reporting rejects unsupported options and cancellation before app replay',async()=>{await assert.rejects(summarizeCaChildcareAppReceipt('not-used',{signal:AbortSignal.abort()}));await assert.rejects(summarizeCaChildcareAppReceipt('not-used',{signal:{}}))});
