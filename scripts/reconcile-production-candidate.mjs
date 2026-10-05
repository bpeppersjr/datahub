import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProductionCandidateReconciliation } from '../runner/production-candidate-reconciliation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flags = ['--plan', '--run-id', '--confirm-plan-sha256', '--confirm-file-sha256'];
if (args.length !== flags.length * 2 || flags.some(flag => args.filter(arg => arg === flag).length !== 1 || !value(flag) || value(flag).startsWith('--')) || args.some((arg, index) => arg.startsWith('--') ? !flags.includes(arg) : !flags.includes(args[index - 1]))) throw new Error('Unknown, duplicate, missing, or malformed argument.');
const receipt = await runProductionCandidateReconciliation({ root, planPath: value('--plan'), candidateRunId: value('--run-id'), confirmationSha256: value('--confirm-plan-sha256'), planFileSha256: value('--confirm-file-sha256') });
console.log(JSON.stringify(receipt, null, 2));
