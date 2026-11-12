import { verifyRegisteredNationalBusinessLifecycleJurisdictionEvidence } from "../runner/national-business-lifecycle-jurisdiction-evidence.mjs";

process.stdout.write(`${JSON.stringify(await verifyRegisteredNationalBusinessLifecycleJurisdictionEvidence(), null, 2)}\n`);
