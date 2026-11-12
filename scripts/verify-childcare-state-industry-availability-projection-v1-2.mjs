import path from "node:path";
import { verifyChildcareStateIndustryAvailabilityProjectionSuccessor } from "../runner/childcare-state-industry-availability-projection.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--manifest") throw new Error("Usage: --manifest <manifest.json>");
const result = await verifyChildcareStateIndustryAvailabilityProjectionSuccessor(path.resolve(args[1]));
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, manifest_sha256: result.manifest_sha256, source_release_id: result.projection.source.release_id, measured_jurisdictions: 7, unmeasured_jurisdictions: 44, ...result.projection.totals }, null, 2)}\n`);
