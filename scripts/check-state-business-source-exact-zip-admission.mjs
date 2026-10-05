import { auditStateBusinessSourceExactZipAdmission } from "../runner/state-business-source-exact-zip-admission-audit.mjs";

try {
  const result = await auditStateBusinessSourceExactZipAdmission();
  console.log(`State business source exact-ZIP admission reconciled: ${result.counts.publishers} publishers, ${result.counts.dimensions} dimensions, ${result.counts.eligible_address_rows} eligible address rows, ${result.counts.missing_or_ineligible_address_rows} missing/ineligible address rows; zero network requests and no production enrollment.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "State business source exact-ZIP admission audit failed.");
  process.exitCode = 1;
}
