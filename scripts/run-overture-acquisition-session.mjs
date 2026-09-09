import path from 'node:path';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { mnSelectionReadJson } from '../runner/mn-construction-retained-selection.mjs';
import { runOvertureAcquisitionSession } from '../runner/overture-acquisition-session.mjs';
import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION } from '../runner/overture-us-places.mjs';

const args = process.argv.slice(2);
const flags = ['--output', '--operation-id', '--metadata-operation-id', '--runtime-operation-id', '--metadata-sha256', '--runtime-sha256', '--authorization'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha = /^[a-f0-9]{64}$/;
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/run-overture-acquisition-session.mjs ' + flags.map(flag => `${flag} VALUE`).join(' ') + '\nRequires explicit large-acquisition confirmation and pinned successful prerequisite operations. No automatic prerequisite downloads, retries or publication.');
} else {
  let fields;
  try {
    if (args.length !== 14) throw Error('arguments');
    fields = new Map();
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index], value = args[index + 1];
      if (!flags.includes(flag) || fields.has(flag) || !value || value.startsWith('--')) throw Error('arguments');
      fields.set(flag, value);
    }
    if (fields.size !== flags.length || fields.get('--authorization') !== OVERTURE_LARGE_ACQUISITION_CONFIRMATION
      || !['--operation-id', '--metadata-operation-id', '--runtime-operation-id'].every(flag => uuid.test(fields.get(flag)))
      || new Set(['--operation-id', '--metadata-operation-id', '--runtime-operation-id'].map(flag => fields.get(flag))).size !== 3
      || !['--metadata-sha256', '--runtime-sha256'].every(flag => sha.test(fields.get(flag)))
      || fields.get('--output') !== path.resolve(fields.get('--output')) || path.basename(fields.get('--output')) !== 'output'
      || path.basename(path.dirname(fields.get('--output'))) !== fields.get('--operation-id')) throw Error('arguments');
  } catch {
    fields = null; console.error('Invalid bounded Overture acquisition arguments.'); process.exitCode = 1;
  }
  if (fields) {
    const cancellation = createCliCancellation();
    try {
      const output = fields.get('--output'), root = path.dirname(path.dirname(output));
      async function prerequisite(name, sourceId, readiness) {
        const operationId = fields.get(`--${name}-operation-id`);
        const record = await mnSelectionReadJson(path.join(root, operationId, 'receipt.json'), 1024 ** 2, cancellation.signal);
        if (record.id !== operationId || record.kind !== 'source-prerequisite' || record.status !== 'SUCCEEDED'
          || record.details?.sourceId !== sourceId || record.result?.sourceId !== sourceId || record.result.receiptIntegrityVerified !== true
          || record.result.inspectionRequired !== false || record.result[readiness] !== true || record.result.acquisitionReady !== false
          || record.result.prerequisite?.sha256 !== fields.get(`--${name}-sha256`) || record.result.prerequisite?.cancellation_after_publication !== false
          || typeof record.startedAt !== 'string') throw Error('prerequisite');
        const reference = { output: path.join(root, operationId, 'output'), operation_id: operationId, descriptor: record.result.prerequisite };
        const read = name === 'metadata' ? (await import('../runner/overture-source-preflight.mjs')).readOvertureSourcePreflight
          : (await import('../runner/overture-httpfs-runtime.mjs')).readOvertureHttpfsRuntime;
        await read(reference.descriptor, { output: reference.output, operationId, startedAt: record.startedAt });
        return reference;
      }
      const metadata = await prerequisite('metadata', 'overture-source-preflight', 'metadataReady');
      const runtime = await prerequisite('runtime', 'overture-httpfs-runtime', 'runtimeReady');
      const descriptor = await runOvertureAcquisitionSession({ output, operationId: fields.get('--operation-id'), metadata, runtime,
        authorization: fields.get('--authorization'), signal: cancellation.signal });
      console.log(JSON.stringify(descriptor)); if (descriptor.cancellation_after_publication) process.exitCode = 1;
    } catch (error) {
      if (error?.recovery) console.log(JSON.stringify({ recovery: error.recovery }));
      console.error('Bounded Overture acquisition did not complete; preserve operation outputs for inspection.'); process.exitCode = 1;
    } finally { cancellation.dispose(); }
  }
}
