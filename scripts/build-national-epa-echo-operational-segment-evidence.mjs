#!/usr/bin/env node
import { buildNationalEpaEchoOperationalSegmentEvidence as build } from '../runner/national-epa-echo-operational-segment-evidence.mjs';
const controller = new AbortController(), cancel = () => controller.abort();
process.once('SIGINT',cancel); process.once('SIGTERM',cancel);
try { const value = await build({ signal:controller.signal }); console.log(JSON.stringify({ releaseDirectory:value.releaseDirectory,manifest_sha256:value.manifest_sha256,summary:{ ...value.manifest.summary,segments:value.segments.map(({ segment,source_record_count }) => ({ segment,source_record_count })) } },null,2)); }
finally { process.removeListener('SIGINT',cancel); process.removeListener('SIGTERM',cancel); }
