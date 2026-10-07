import assert from 'node:assert/strict';
import test from 'node:test';
import {qualifyCaChildcareLifecycle} from './ca-childcare-lifecycle-qualification.mjs';

const date=(raw=null,iso_date=null,reason='missing-date')=>({raw,iso_date,reason:iso_date===null?reason:null});
const row=(status,closed=date(),file=date('05/25/2025','2025-05-25'),first=date('01/02/2020','2020-01-02'))=>({source_status:{status_source:status},temporal:{closed_date:closed,file_date:file,license_first_date:first}});

test('qualifies the exact publisher vocabulary without verifying active operation',()=>{
  for(const status of ['LICENSED','ON PROBATION'])assert.equal(qualifyCaChildcareLifecycle(row(status)).qualification,'publisher-open-status-candidate');
  for(const status of ['CLOSED','INACTIVE'])assert.equal(qualifyCaChildcareLifecycle(row(status)).qualification,'publisher-nonopen-status');
  assert.equal(qualifyCaChildcareLifecycle(row('PENDING')).qualification,'publisher-pending-status');
  for(const status of ['LICENSED','ON PROBATION','CLOSED','INACTIVE','PENDING'])assert.deepEqual(qualifyCaChildcareLifecycle(row(status)).claims,{current_operation_verified:false,active_business_verified:false,physical_site_verified:false});
});

test('separates contradictory closed dates and preserves explicit date quality',()=>{
  const result=qualifyCaChildcareLifecycle(row('LICENSED',date('05/01/2025','2025-05-01'),date('unknown',null,'unparsed-file-date'),date()));
  assert.equal(result.qualification,'contradictory-publisher-lifecycle-evidence');
  assert.deepEqual(result.date_quality,{file_date:'unparsed-or-invalid',license_first_date:'missing',closed_date:'parsed'});
  assert.equal(qualifyCaChildcareLifecycle(row('PENDING',date('05/01/2025','2025-05-01'))).qualification,'contradictory-publisher-lifecycle-evidence');
});

test('fails closed on publisher vocabulary or date-shape drift',()=>{
  assert.throws(()=>qualifyCaChildcareLifecycle(row('ACTIVE')),/unsupported publisher status/);
  assert.throws(()=>qualifyCaChildcareLifecycle({source_status:{status_source:'LICENSED'},temporal:{closed_date:null,file_date:date(),license_first_date:date()}}),/date shape/);
});
