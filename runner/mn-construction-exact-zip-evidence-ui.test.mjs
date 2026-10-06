import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');
const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');

test('Industry Status renders the read-only Minnesota evidence block once',()=>{assert.equal((source.match(/<MnConstructionEvidenceStatusBlock\/>/g)??[]).length,1);assert.match(source,/GovernedCoverageStates\(\).*MnConstructionEvidenceStatusBlock/s);assert.match(source,/11,456|source_credential_rows:11456/);assert.match(source,/positive_zip5_rows:961/);assert.match(source,/Local-review-only, nonadditive publisher credential-row evidence; current operation is unverified/);assert.match(source,/not a business, physical-site, completeness, geocoding, or matrix-admission measure/);assert.doesNotMatch(source,/MnConstructionEvidenceStatusBlock[\s\S]{0,300}<button/i);});
test('server protects and wires the status route after control-plane authorization',()=>{const authorize=server.indexOf('controlPlane.authorize(request)'),route=server.indexOf("'/api/business-map/mn-construction-exact-zip-evidence-status'");assert.ok(authorize>0&&route>authorize);assert.match(server,/mnConstructionExactZipEvidenceStatusHttp\(request,response,url,readMnConstructionExactZipEvidenceStatus,json\)/);});
