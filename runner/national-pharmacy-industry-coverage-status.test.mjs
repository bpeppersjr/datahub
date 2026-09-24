import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nationalPharmacyIndustryCoverageStatusHttp } from './national-pharmacy-industry-coverage-status-http.mjs';
import { loadNationalPharmacyIndustryCoverageStatus } from './national-pharmacy-industry-coverage-status.mjs';

const call=async(method='GET',suffix='',headers={},loader=async()=>({available:true}))=>{let result;await nationalPharmacyIndustryCoverageStatusHttp({method,headers},{},new URL(`http://local/api/data-operations/national-pharmacy-industry-coverage-status${suffix}`),loader,(_response,status,body)=>{result={status,body}});return result};
test('status endpoint accepts only an empty read-only GET and hides loader failures',async()=>{
  assert.equal((await call()).status,200);
  assert.equal((await call('GET','?detail=rows')).status,400);
  assert.equal((await call('GET','',{'content-length':'2'})).status,400);
  assert.equal((await call('POST')).status,405);
  const failed=await call('GET','','',async()=>{throw new Error('C:\\private\\manifest.json')});assert.equal(failed.status,503);assert.doesNotMatch(failed.body.error,/private|manifest/);
});
test('management status independently reads the retained summary without paths or additive claims',async()=>{
  const view=await loadNationalPharmacyIndustryCoverageStatus();
  assert.equal(view.coverage.accepted_organization_rows,89077);assert.equal(view.coverage.reported_address_count,89074);
  assert.equal(view.supplementary_secondary_addresses.additive_to_primary_counts,false);
  assert.deepEqual(view.inclusion,{generic_business_totals:false,generic_category_totals:false,production_enrollment:false,status:'excluded-non-additive-local-review'});
  assert.equal(JSON.stringify(view).includes('releaseDirectory'),false);
});
test('server authorizes before dispatching pharmacy status and binds the exact-ZIP lookup',async()=>{
  const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf("url.pathname === '/api/data-operations/national-pharmacy-industry-coverage-status'")>source.indexOf('controlPlane.authorize(request)'));
  assert.match(source,/request\.method === 'OPTIONS'.*national-pharmacy-industry-coverage-status/);
  assert.match(source,/pharmacyCoverage: async \(\{ zip \}\).*lookupNationalPharmacyIndustryZip5\(zip\)/s);
});
