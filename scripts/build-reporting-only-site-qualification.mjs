import { buildReportingOnlySiteQualification } from '../runner/reporting-only-site-qualification.mjs';
const result = await buildReportingOnlySiteQualification();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
