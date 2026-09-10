import path from 'node:path';
import { opendir } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical, mnSelectionReadJson } from './mn-construction-retained-selection.mjs';

async function list(root) {
  await mnSelectionCanonical(root);
  const baselines = []; let unavailable = 0, inspected = 0, truncated = false;
  let directory;
  try { directory = await opendir(root); } catch (error) {
    if (error.code === 'ENOENT') return { baselines, unavailable, truncated, verification: 'manifest-only' };
    throw error;
  }
  for await (const entry of directory) {
    if (++inspected > 32) { truncated = true; break; }
    if (!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name) || entry.name.includes('..')) { unavailable++; continue; }
    try {
      const meter = {}, manifest = await mnSelectionReadJson(path.join(root, entry.name, 'manifest.json'), 4 * 1024 ** 2, undefined, meter);
      if (manifest.dataset_id !== 'census-zbp-baseline' || manifest.release_id !== entry.name || manifest.status !== 'published'
        || manifest.complete_national_release !== true || !Number.isInteger(manifest.reference_year)
        || manifest.reference_year < 1900 || manifest.reference_year > 2200) throw Error();
      baselines.push({ releaseId: entry.name, sha256: meter.sha256, referenceYear: manifest.reference_year });
    } catch { unavailable++; }
  }
  baselines.sort((a, b) => a.releaseId.localeCompare(b.releaseId));
  return { baselines, unavailable, truncated, verification: 'manifest-only' };
}
export async function listOvertureNormalizationBaselines() {
  try { return await list(path.join(APP_ROOT, 'data/business-baselines/census-zbp/releases')); }
  catch { throw new Error('Retained Census baseline choices are unavailable. No data was changed.'); }
}
export async function listOvertureNormalizationBaselinesForTest(root) { return list(root); }
