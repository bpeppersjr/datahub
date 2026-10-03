import path from "node:path";
import { buildChildcareStateIndustryAvailabilityProjection } from "../runner/childcare-state-industry-availability-projection.mjs";
const args = process.argv.slice(2); if (args.length) throw Error("Usage: node scripts/build-childcare-state-industry-availability-projection.mjs");
const r = await buildChildcareStateIndustryAvailabilityProjection();
console.log(JSON.stringify({ release_id: r.manifest.release_id, manifest: path.join(r.releaseDirectory, "manifest.json"), measured_jurisdictions: 7, unmeasured_jurisdictions: 44, ...r.projection.totals, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, reused_existing_release: r.reused_existing_release }, null, 2));
