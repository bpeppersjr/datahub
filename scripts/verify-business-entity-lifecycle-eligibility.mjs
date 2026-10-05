#!/usr/bin/env node
import { mnSelectionReadJson as readJson } from '../runner/mn-construction-retained-selection.mjs';
import { APP_ROOT } from '../runner/paths.mjs';
import path from 'node:path';
import { verifyBusinessEntityLifecycleRelease } from '../runner/business-entity-lifecycle-eligibility.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

if (process.argv.length > 2) throw new Error('This offline lifecycle verifier accepts no arguments.');
const cancellation = createCliCancellation();
try {
  const registration = await readJson(path.join(APP_ROOT, 'config/datasets/business-entity-lifecycle-eligibility.json'), 1_000_000, cancellation.signal);
  const selected = registration.retained_releases?.filter(item => item.selected === true) ?? [];
  if (selected.length !== 1) throw new Error('Lifecycle release selection is unavailable or ambiguous.');
  const result = await verifyBusinessEntityLifecycleRelease({ release_id: selected[0].release_id, expectedManifestSha256: selected[0].manifest_sha256, signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = cancellation.signal.aborted ? 130 : 1; }
finally { cancellation.dispose(); }
