import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { verifyUspsOperationalZipRelease } from './usps-operational-zip-assignments.mjs';

const DATASET = 'usps-operational-zip-assignments';

export const USPS_OPERATIONAL_ZIP_PRODUCTION_FILES = Object.freeze([
  'runner/usps-operational-zip-production-input.mjs',
  'runner/usps-operational-zip-assignments.mjs',
  'config/connectors/usps-operational-zip-assignments.json',
  'config/source-policies/usps-operational-zip-assignments.json',
  'config/datasets/usps-operational-zip-assignments.json',
]);

export async function pinUspsOperationalZipProductionInput(root, pointerPath, { safe, fileHash, rel }) {
  if (typeof pointerPath !== 'string' || !pointerPath.trim()) throw new Error('USPS operational ZIP selection must name one canonical current.json pointer.');
  const pointerFile = await safe(root, pointerPath);
  if (path.basename(pointerFile) !== 'current.json') throw new Error('USPS operational ZIP selection must name current.json.');
  const pointerBefore = await fileHash(pointerFile);
  const pointerBytes = await readFile(pointerFile);
  const pointer = JSON.parse(pointerBytes);
  if (pointer.dataset_id !== DATASET || typeof pointer.release_id !== 'string' || !pointer.release_id) throw new Error('USPS operational ZIP pointer identity is invalid.');
  const manifestFile = await safe(root, path.resolve(path.dirname(pointerFile), pointer.manifest ?? ''));
  if (manifestFile !== path.join(path.dirname(pointerFile), 'releases', pointer.release_id, 'manifest.json')) throw new Error('USPS operational ZIP pointer must select its canonical immutable release receipt.');
  const before = await fileHash(manifestFile);
  const verified = await verifyUspsOperationalZipRelease(manifestFile);
  const manifestBytes = await readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  const after = await fileHash(manifestFile);
  const pointerAfter=await fileHash(pointerFile);
  if (pointerBefore.sha256 !== pointerAfter.sha256 || pointerBefore.bytes !== pointerAfter.bytes || before.sha256 !== after.sha256 || before.bytes !== after.bytes || verified.dataset_id !== DATASET || verified.release_id !== pointer.release_id) throw new Error('USPS operational ZIP release identity changed during independent verification.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(verified.source_month ?? '')) throw new Error('USPS operational ZIP release lacks an exact source-month receipt.');
  if (manifest.use_authorization?.basis !== 'usps-written-permission' || manifest.use_authorization?.redistribution_authorized !== true || typeof manifest.use_authorization?.permission_reference !== 'string' || !manifest.use_authorization.permission_reference.trim()) throw new Error('Production planning requires explicit governed USPS written-permission evidence.');
  const artifacts=[];
  for (const artifact of manifest.artifacts ?? []) {
    const file=await safe(root,path.resolve(path.dirname(manifestFile),artifact.path));
    const actual=await fileHash(file);
    if(actual.sha256!==artifact.sha256||actual.bytes!==artifact.bytes)throw new Error('USPS operational ZIP artifact changed after verification.');
    artifacts.push({path:rel(root,file),...actual});
  }
  const configurationPins=[];
  for(const relative of USPS_OPERATIONAL_ZIP_PRODUCTION_FILES.slice(2))configurationPins.push({path:relative,...await fileHash(await safe(root,relative))});
  return {pointer:rel(root,pointerFile),pointerSha256:pointerBefore.sha256,manifestPath:rel(root,manifestFile),manifestSha256:before.sha256,releaseId:verified.release_id,datasetId:verified.dataset_id,sourceMonth:verified.source_month,useAuthorization:{basis:manifest.use_authorization.basis,permissionReference:manifest.use_authorization.permission_reference,redistributionAuthorized:true},artifacts,configurationPins};
}
