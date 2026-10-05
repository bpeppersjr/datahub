import { verifyReportingOnlySiteQualification } from '../runner/reporting-only-site-qualification.mjs';
const result = await verifyReportingOnlySiteQualification();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
