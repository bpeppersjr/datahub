import path from "node:path";
import { verifyChildcareStateIndustryAvailabilityProjection } from "../runner/childcare-state-industry-availability-projection.mjs";
const args = process.argv.slice(2); if (args.length !== 2 || args[0] !== "--manifest") throw Error("Usage: node scripts/verify-childcare-state-industry-availability-projection.mjs --manifest <manifest.json>");
const r = await verifyChildcareStateIndustryAvailabilityProjection(path.resolve(args[1]));
console.log(JSON.stringify({ status: "verified", release_id: r.manifest.release_id, manifest_sha256: r.manifest_sha256, measured_jurisdictions: 7, unmeasured_jurisdictions: 44, ...r.projection.totals }, null, 2));
