import { buildNationalBusinessLifecycleJurisdictionEvidence } from "../runner/national-business-lifecycle-jurisdiction-evidence.mjs";

process.stdout.write(`${JSON.stringify(await buildNationalBusinessLifecycleJurisdictionEvidence(), null, 2)}\n`);
