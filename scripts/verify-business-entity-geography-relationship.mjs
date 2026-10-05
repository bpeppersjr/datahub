#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { APP_ROOT } from '../runner/paths.mjs';
import { verifyBusinessEntityGeographyRelationship } from '../runner/business-entity-geography-relationship.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const cancellation = createCliCancellation();
try {
  const registration = JSON.parse(await readFile(`${APP_ROOT}/config/datasets/business-entity-geography-relationship.json`, 'utf8'));
  const selected = registration.retained_releases.filter(item => item.selected === true);
  if (selected.length !== 1) throw new Error('Expected one selected geography relationship release.');
  const result = await verifyBusinessEntityGeographyRelationship({ release_id: selected[0].release_id, expectedManifestSha256: selected[0].manifest_sha256, signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
