import { buildNationalGoalEvidenceFederation } from '../runner/national-goal-evidence-federation.mjs';
const result=await buildNationalGoalEvidenceFederation();
console.log(JSON.stringify({releaseDirectory:result.releaseDirectory,manifest_sha256:result.manifest_sha256,...result.manifest.summary},null,2));
