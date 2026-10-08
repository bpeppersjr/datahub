#!/usr/bin/env node
import { verifyNationalEpaEchoNaicsZipIndustryEvidence as verify } from '../runner/national-epa-echo-naics-zip-industry-evidence.mjs';
const index = process.argv.indexOf('--manifest');
if (index < 0 || !process.argv[index + 1]) throw new Error('--manifest is required');
const controller = new AbortController(), cancel = () => controller.abort();
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try { console.log(JSON.stringify(await verify(process.argv[index + 1], { signal:controller.signal }), null, 2)); }
finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
