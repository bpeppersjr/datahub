import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nationalSnapRetailerIndustryCoverageStatusHttp } from './national-snap-retailer-industry-coverage-status-http.mjs';
import { loadNationalSnapRetailerIndustryCoverageStatus } from './national-snap-retailer-industry-coverage-status.mjs';

const call=async(method='GET',suffix='',headers={},loader=async()=>({available:true}))=>{let result;await nationalSnapRetailerIndustryCoverageStatusHttp({method,headers},{},new URL(`http://local/api/data-operations/national-snap-retailer-industry-coverage-status${suffix}`),loader,(_response,status,body)=>{result={status,body}});return result};

test('SNAP status endpoint accepts only an empty read-only GET and redacts failures',async()=>{
  assert.equal((await call()).status,200);
  assert.equal((await call('GET','?detail=rows')).status,400);
  assert.equal((await call('GET','',{'content-length':'2'})).status,400);
  assert.equal((await call('GET','',{'transfer-encoding':'chunked'})).status,400);
  assert.equal((await call('POST')).status,405);
  assert.equal((await call('OPTIONS')).status,405);
  const failed=await call('GET','','',async()=>{throw new Error('C:\\private\\snap-manifest.json')});
  assert.equal(failed.status,503);assert.doesNotMatch(failed.body.error,/private|manifest/);
});

test('SNAP management status exposes verified aggregates and explicit exclusions only',async()=>{
  const view=await loadNationalSnapRetailerIndustryCoverageStatus();
  assert.equal(view.available,true);
  assert.equal(view.coverage.authorized_retailer_location_count,252080);
  assert.equal(view.coverage.reported_zip4_count,224257);
  assert.equal(view.claims.current_operation,null);
  assert.equal(view.claims.all_grocery_retailers,false);
  assert.deepEqual(view.inclusion,{generic_business_totals:false,generic_entity_totals:false,generic_site_totals:false,generic_category_totals:false,generic_exports:false,production_enrollment:false,status:'excluded-non-additive-governed-layer'});
  assert.equal(JSON.stringify(view).includes('releaseDirectory'),false);
});

test('server authorizes before dispatching SNAP status and binds exact-ZIP lookup',async()=>{
  const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf("url.pathname === '/api/data-operations/national-snap-retailer-industry-coverage-status'")>source.indexOf('controlPlane.authorize(request)'));
  assert.match(source,/request\.method === 'OPTIONS'.*national-snap-retailer-industry-coverage-status/);
  assert.match(source,/snapRetailerCoverage: async \(\{ zip \}\).*lookupNationalSnapRetailerIndustryZip5\(zip\)/s);
});
