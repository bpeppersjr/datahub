import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCmsNursingHomeChainReview} from './cms-nursing-home-chain-review.mjs';
import {cmsNursingHomeChainReviewHttp} from './cms-nursing-home-chain-review-http.mjs';

const row={assertionId:'a'.repeat(64)+':2',lineage:{manifestPath:'PRIVATE/manifest.json',manifestSha256:'1'.repeat(64),selectedArtifactPath:'PRIVATE/selected.jsonl',selectedArtifactSha256:'2'.repeat(64),rawCsvPath:'PRIVATE/source.csv',rawCsvSha256:'3'.repeat(64),sourceRow:2,sourceRecordId:'cms-pdc:4pq5-n9py:row:2',ccn:'012345'},temporal:{publisherProcessingDateRaw:'2026-07-01',sourceDates:{released:'2026-07-30'},observedAt:'2026-08-01T00:00:00Z',recoveryCreatedAt:'2026-08-02T00:00:00Z'},chainName:{raw:'Source Native Chain',status:'lexically-valid'},chainId:{raw:'0007',status:'lexically-valid'},reportedFacilities:{raw:'1',status:'lexically-valid',value:1},retainedGroupEvidence:{memberRows:1,reportedFacilityCounts:[1],nameVariantCount:1,reportedCountReconciliation:'matches-retained-membership'},flags:[]};
const summary={assertionRows:14690,sourceRows:14690,rowsWithLexicallyValidChainId:10116,rowsMissingChainId:4574,rowsUnresolvedChainId:0};

test('review projects minimized rows, opaque IDs, conservation, and no filesystem paths',async()=>{
 let passed;const review=createCmsNursingHomeChainReview({load:async options=>{passed=options;return {summary};},page:(_view,options)=>({total:1,rows:[row],options})});
 const result=await review({chainId:'0007',ccn:'012345',offset:0,limit:25,signal:AbortSignal.timeout(1000)});
 assert.ok(passed.signal);assert.equal(result.rows[0].chain.publisher_chain_id,'0007');assert.equal(result.page.total_matching_assertion_rows,1);assert.equal(result.conservation.retained_assertion_rows,14690);assert.equal(result.semantics.public_export_authorized,false);
 const text=JSON.stringify(result);assert.doesNotMatch(text,/manifestPath|ArtifactPath|rawCsvPath|PRIVATE|download|legalParentVerified/);assert.match(result.semantics.claim_boundary,/not proof of legal parenthood.*network identity.*unique business.*physical site.*current operation/i);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.rows[0]));
});

test('review rejects broad, malformed, repeated and body-bearing requests and cancellation',async()=>{
 const review=createCmsNursingHomeChainReview({load:async()=>({summary}),page:()=>({total:0,rows:[]})});
 await assert.rejects(review({chainId:'7 OR 1=1'}),{statusCode:400});await assert.rejects(review({limit:101}),{statusCode:400});await assert.rejects(review({offset:25001}),{statusCode:400});await assert.rejects(review({signal:AbortSignal.abort()}),{name:'AbortError'});
 const run=async(path,request={method:'GET',headers:{},readableLength:0,resume(){}})=>{let answer;await cmsNursingHomeChainReviewHttp(request,{},new URL(path,'http://local'),review,(_r,status,value)=>{answer={status,value};},new AbortController().signal);return answer;};
 assert.equal((await run('/?chain_id=1&chain_id=2')).status,400);assert.equal((await run('/?limit=101')).status,400);assert.equal((await run('/?limit=050')).status,400);assert.equal((await run('/?offset=00001')).status,400);assert.equal((await run('/?extra=x')).status,400);assert.equal((await run('/',{method:'POST',headers:{},readableLength:0,resume(){}})).status,405);assert.equal((await run('/',{method:'GET',headers:{'content-length':'2'},readableLength:2,resume(){}})).status,400);
});

test('server guard precedes route and UI cancels stale requests without export controls',async()=>{
 const [server,ui,host]=await Promise.all([readFile(new URL('./server.mjs',import.meta.url),'utf8'),readFile(new URL('../app/cms-nursing-home-chain-review.tsx',import.meta.url),'utf8'),readFile(new URL('../app/data-operations.tsx',import.meta.url),'utf8')]);
 assert.ok(server.indexOf('controlPlane.authorize(request)')<server.indexOf("'/api/local-review/cms-nursing-home-chains'"));assert.match(ui,/new AbortController\(\)/);assert.match(ui,/return\(\)=>controller\.abort\(\)/);assert.match(ui,/No export or download is available/);assert.match(ui,/missing.*unresolved chain IDs/s);assert.doesNotMatch(ui,/downloadRunnerArtifact|href=|manifestPath|rawCsvPath/);assert.match(host,/<CmsNursingHomeChainReview \/>/);
});
