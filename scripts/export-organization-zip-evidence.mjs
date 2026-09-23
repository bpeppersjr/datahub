import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { exportOrganizationZipEvidence } from '../runner/organization-zip-evidence-export.mjs';

const cancellation = createCliCancellation();
try {
  const allowed = new Set(['--zip', '--policy-mode', '--format', '--publisher-state', '--output-root']); const values = new Map(); const args = process.argv.slice(2);
  if (args.length % 2) throw new Error('Invalid arguments.');
  for (let index = 0; index < args.length; index += 2) { const key = args[index], value = args[index + 1]; if (!allowed.has(key) || !value || value.startsWith('--') || values.has(key)) throw new Error('Invalid arguments.'); values.set(key, value); }
  if (!values.has('--zip') || !values.has('--policy-mode') || !values.has('--format')) throw new Error('Missing required arguments.');
  const result = await exportOrganizationZipEvidence({ zip5: values.get('--zip'), policyMode: values.get('--policy-mode'), format: values.get('--format'), publisherState: values.get('--publisher-state') ?? null, outputRoot: values.get('--output-root'), signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) { if (error.recovery) process.stdout.write(`${JSON.stringify({ recovery: error.recovery })}\n`); process.stderr.write(`Organization ZIP export did not complete: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
