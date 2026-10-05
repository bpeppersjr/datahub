#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { buildBusinessEntityGeographyRelationship } from '../runner/business-entity-geography-relationship.mjs';

const cancellation = createCliCancellation();
try {
  const result = await buildBusinessEntityGeographyRelationship({ signal: cancellation.signal, logger: message => process.stderr.write(`${message}\n`) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
