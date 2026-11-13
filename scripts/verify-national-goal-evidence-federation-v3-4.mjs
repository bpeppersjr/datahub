import path from 'node:path';
import { verifyNationalGoalEvidenceFederation } from '../runner/national-goal-evidence-federation.mjs';
const [manifest]=process.argv.slice(2);if(!manifest)throw Error('Usage: <manifest.json>');
console.log(JSON.stringify(await verifyNationalGoalEvidenceFederation(path.resolve(manifest),{configPath:'config/national-goal-evidence-federation-v3-4.json'}),null,2));
