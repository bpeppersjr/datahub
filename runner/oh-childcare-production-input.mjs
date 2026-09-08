import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadOhChildcareRegistryInput } from './oh-childcare-registry-input.mjs';
import { ohioBoundedRead } from './oh-childcare-release.mjs';

export const OH_PRODUCTION_MODULES = [
  ...['production-input','coverage-evidence','geographic-evidence','registry-adapter','registry-input','app','acquired-release','release','normalization','acquisition','preflight','transport','source-use'].map(name=>`runner/oh-childcare-${name}.mjs`),
];
export const OH_PRODUCTION_CONFIGURATION = [
  'config/oh-childcare-app-enrollment.json',
  'config/connectors/oh-dcy-publisher-open-childcare-centers.json',
  'config/source-policies/oh-childcare-local-review.json',
  'config/source-policies/oh-childcare-internal-acquisition.json',
  'docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json',
];

/** Read-only retained-job selection. No acquisition or refresh is performed. */
export async function pinOhioProductionInput(root, selected, { safe, fileHash, rel }) {
  if (typeof selected !== 'string' || !selected.trim()) throw new Error('Ohio requires an explicit completed app receipt.');
  const receiptPath = await safe(root, selected);
  const input = await loadOhChildcareRegistryInput(receiptPath), source = input.source;
  if (source.executionMode !== 'fixed-native-fetch') throw new Error('Ohio production requires the fixed native app entry, not injected transport.');
  const artifacts = [];
  const add = async (file, expected) => {
    file = await safe(root, file);
    const actual = await fileHash(file);
    if (expected && (actual.sha256 !== expected.sha256 || expected.bytes !== undefined && actual.bytes !== expected.bytes)) throw new Error('Ohio retained production artifact changed.');
    artifacts.push({ path: rel(root, file), ...actual });
  };
  await add(receiptPath, { sha256: source.receiptSha256 });
  for (const name of ['start.json','acquisition-receipt.json']) await add(path.join(path.dirname(receiptPath), name));
  for (const [file, sha256] of [[source.acquisitionManifestPath,source.acquisitionManifestSha256],[source.manifestPath,source.manifestSha256]]) {
    await add(file, { sha256 });
    const bytes = await ohioBoundedRead(await safe(root,file),100_000);
    if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Ohio consumed production manifest changed.');
    const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    for (const artifact of manifest.artifacts) await add(path.resolve(path.dirname(file),artifact.path), artifact);
  }
  const configurationPins = [];
  for (const file of OH_PRODUCTION_CONFIGURATION) configurationPins.push({path:file,...await fileHash(await safe(root,file))});
  const final = await loadOhChildcareRegistryInput(receiptPath);
  if (!isDeepStrictEqual(final.source,source)) throw new Error('Ohio retained production source changed.');
  for (const pin of [...artifacts,...configurationPins]) if (!isDeepStrictEqual(await fileHash(await safe(root,pin.path)),{sha256:pin.sha256,bytes:pin.bytes})) throw new Error('Ohio production snapshot changed.');
  return { sourceKey:'ohChildcareReceipt', receiptPath:rel(root,receiptPath), manifestPath:rel(root,source.manifestPath),
    manifestSha256:source.manifestSha256, releaseId:source.releaseId, datasetId:'oh-dcy-publisher-open-childcare-centers',
    source, artifacts, configurationPins };
}
