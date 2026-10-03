import { publishBroadOrganizationAdjacentEvidenceIndex } from "../runner/broad-organization-adjacent-evidence-index.mjs";

const result = await publishBroadOrganizationAdjacentEvidenceIndex();
process.stdout.write(`${JSON.stringify({ release_id: result.index.release_id, directory: result.directory, summary: result.index.summary }, null, 2)}\n`);
