import { mnConstructionFailure } from './mn-construction-diagnostics.mjs';

// Reviewed operational hold, not a claim about publisher authenticity. Keep
// this evidence when a future verified parser/source repair retires the hold.
export const MN_REGISTRATIONS_CSV_HOLD = Object.freeze({
  schema_version:'mn-construction-source-hold@1.0.0',
  cohort:'registrations',
  etag:'"06cd86f3fdd1:0"',
  reason:'source-csv-closing-quote',
  operation_id:'81a6f52f-555a-4683-8a46-b9da7597f182',
  app_job_id:'03b4a883-610a-4747-8648-5eccf82df553',
  receipt_sha256:'8e38fe4766558d2cccf175b8e8eb013a31da0bca22f91d6116448cbf4bc7ceb8',
  diagnostic_sha256:'740bd8ba3bf224bb6dd2143c1a9f34d67d8cd85504504ccabf9023aa74a8ae28',
  preflight_sha256:'7c0ffeee731a2b105823fccc2101657cf722c386fed1ad399245cc63c985e2c5',
});

// Called only after the transport validates the fixed URL/roster and snapshots
// its preflight. Do not let changed incidental metadata bypass the same ETag.
// A new ETag still must pass all ordinary acquisition and CSV validation.
export function assertMnConstructionSourceNotHeld(cohort,identity) {
  if(cohort===MN_REGISTRATIONS_CSV_HOLD.cohort && identity.etag===MN_REGISTRATIONS_CSV_HOLD.etag) {
    throw mnConstructionFailure(null,'source-version-held');
  }
}
