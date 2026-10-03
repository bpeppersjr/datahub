import { publishAkBroadOrganizationAdmissionCandidate } from "../runner/ak-broad-organization-admission.mjs";

const result = await publishAkBroadOrganizationAdmissionCandidate();
process.stdout.write(`${JSON.stringify({ release_id: result.candidate.release_id, manifest_sha256: result.manifest_sha256, directory: result.directory })}\n`);
