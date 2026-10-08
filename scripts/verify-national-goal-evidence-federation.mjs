import fs from 'node:fs/promises';
import { verifyNationalGoalEvidenceFederation } from '../runner/national-goal-evidence-federation.mjs';
const registration=JSON.parse(await fs.readFile(new URL('../config/datasets/national-goal-evidence-federation.json',import.meta.url)));
console.log(JSON.stringify(await verifyNationalGoalEvidenceFederation(process.argv[2]??registration.retained_release.manifest),null,2));
