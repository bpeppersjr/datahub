import { buildNationalBusinessLifecycleZipEvidence } from "../runner/national-business-lifecycle-zip-evidence.mjs";

process.stdout.write(`${JSON.stringify(await buildNationalBusinessLifecycleZipEvidence(), null, 2)}\n`);
