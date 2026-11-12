import path from "node:path";
import { buildChildcareStateIndustryAvailabilityProjectionSuccessor } from "../runner/childcare-state-industry-availability-projection.mjs";

if (process.argv.length !== 2) throw new Error("This builder accepts no arguments.");
const result = await buildChildcareStateIndustryAvailabilityProjectionSuccessor();
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest: path.join(result.releaseDirectory, "manifest.json"), source_release_id: result.projection.source.release_id, measured_jurisdictions: 7, unmeasured_jurisdictions: 44, ...result.projection.totals, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, reused_existing_release: result.reused_existing_release }, null, 2)}\n`);
