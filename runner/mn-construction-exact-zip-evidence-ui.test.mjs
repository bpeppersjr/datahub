import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');
const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');

test('Industry Status renders the generic adjacent evidence catalog once',()=>{assert.equal((source.match(/<AdjacentExactZipEvidenceCatalog\/>/g)??[]).length,1);assert.match(source,/GovernedCoverageStates\(\).*AdjacentExactZipEvidenceCatalog/s);assert.match(source,/positive ZIP5 keys/);assert.match(source,/local-review-only.*nonadditive/s);assert.match(source,/not businesses, physical sites, completeness, geocoding, or verified current operation/);assert.match(source,/not extra matrix counts/);assert.doesNotMatch(source,/AdjacentExactZipEvidenceCatalog[\s\S]{0,300}<button/i);});
test('server protects and wires the status route after control-plane authorization',()=>{const authorize=server.indexOf('controlPlane.authorize(request)'),route=server.indexOf("'/api/business-map/mn-construction-exact-zip-evidence-status'");assert.ok(authorize>0&&route>authorize);assert.match(server,/mnConstructionExactZipEvidenceStatusHttp\(request,response,url,readMnConstructionExactZipEvidenceStatus,json\)/);});
test('server protects and wires the adjacent catalog route after control-plane authorization',()=>{const authorize=server.indexOf('controlPlane.authorize(request)'),route=server.indexOf("'/api/business-map/adjacent-exact-zip-evidence-catalog'");assert.ok(authorize>0&&route>authorize);assert.match(server,/adjacentExactZipEvidenceCatalogHttp\(request,response,url,readAdjacentExactZipEvidenceCatalog,json\)/);});
