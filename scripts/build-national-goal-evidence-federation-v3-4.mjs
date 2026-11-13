import { buildNationalGoalEvidenceFederation } from '../runner/national-goal-evidence-federation.mjs';
const result=await buildNationalGoalEvidenceFederation({configPath:'config/national-goal-evidence-federation-v3-4.json',createdAt:'2026-11-13T00:30:00.000Z'});
console.log(JSON.stringify({releaseDirectory:result.releaseDirectory,manifest_sha256:result.manifest_sha256,...result.manifest.summary},null,2));
