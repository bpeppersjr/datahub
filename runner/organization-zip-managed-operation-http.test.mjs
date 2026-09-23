import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('authenticated managed organization export route is separate from generic exports and validation precedes execution',async()=>{
  const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  const authorize=server.indexOf('controlPlane.authorize(request);');
  const dataOperations=server.indexOf("if (segments[0] === 'api' && segments[1] === 'data-operations')");
  const allowedRoute=server.indexOf("'organization-zip-evidence-exports'");
  const dispatch=server.indexOf('managedOperations.startOrganizationZipEvidenceExport(input)');
  assert.ok(authorize>=0&&authorize<dataOperations&&dataOperations<allowedRoute&&allowedRoute<dispatch);
  assert.match(server,/endpoint === 'organization-zip-evidence-exports' \? await managedOperations\.startOrganizationZipEvidenceExport\(input\)/);
  const operations=await readFile(new URL('./managed-operations.mjs',import.meta.url),'utf8');
  const validation=operations.indexOf('async startOrganizationZipEvidenceExport(input');
  const strictChecks=operations.indexOf('Organization ZIP export selection is invalid.',validation);
  const allocate=operations.indexOf("this.#start(\"organization-zip-export\"",validation);
  const runner=operations.indexOf('this.organizationZipExporter({',operations.indexOf('async #run('));
  assert.ok(validation>=0&&strictChecks>validation&&allocate>strictChecks&&runner>allocate);
  assert.doesNotMatch(operations,/profileArtifacts\s*\([^)]*organization-zip/);
});
