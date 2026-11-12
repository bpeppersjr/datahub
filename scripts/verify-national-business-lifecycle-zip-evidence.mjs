import { verifyRegisteredNationalBusinessLifecycleZipEvidence } from "../runner/national-business-lifecycle-zip-evidence.mjs";

process.stdout.write(`${JSON.stringify(await verifyRegisteredNationalBusinessLifecycleZipEvidence(), null, 2)}\n`);
