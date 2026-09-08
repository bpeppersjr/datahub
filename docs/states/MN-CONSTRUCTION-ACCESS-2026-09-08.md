# Minnesota construction: documented download candidate

Observed September 8, 2026. This is a new construction-industry candidate, not a replacement for the Minnesota SOS hold or the [MDA food-license assessment](MN-FOOD-ACCESS-2026-09-07.md). Direct download availability is confirmed at the HTTP-header level; schema, business-only scope and app enrollment are not. The machine-readable [observation record](MN-CONSTRUCTION-ACCESS-2026-09-08.json) preserves the exact HEAD results.

## What changed the next action

DLI's [official lookup page](https://dli.mn.gov/license-and-registration-lookup) explicitly offers downloadable construction credential files and describes nightly updates. It associates current active credentials with the source status `Issued`. Separate contractor-registration and residential-contractor links permit narrower investigation than the combined export of businesses and individuals. No account or interactive iMS search was used in this assessment.

The two fixed endpoints returned HTTP 200 to direct HEAD requests, with redirects prohibited and 15-second deadlines. At 10:23:36Z the registration export declared 4,408,602 bytes; at 10:23:38Z the residential export declared 12,185,026 bytes. Both advertised byte ranges and September 7 modification times. These are server header assertions, not measured file sizes, row counts, source freshness guarantees or evidence that range requests work. No export body was requested or retained.

## Keep credential and business identity separate

The [residential contractor FAQ](https://www.dli.mn.gov/business/residential-contractors/residential-contractor-faqs) distinguishes business licenses from qualifying-person registrations. BC, CR, RR and MI denote business-license classes; QB, QC, QR and QI identify personal qualification records, not additional businesses. A qualifying person can differ from the owner, and personal qualification and business-license expiry dates can differ. These documented codes guide the proposed contract; they have not been observed in the current export schema.

DLI's [consumer guidance](https://www.dli.mn.gov/workers/homeowners/tips-hiring-contractor) separately distinguishes IR contractor registrations from licenses. Proposed normalized identifiers must therefore retain publisher, credential kind and full original code; never label every row a licensed contractor. Status membership is a publisher assertion, not independent proof of current operations, a physical establishment, unique identity or all-industry coverage.

Proposed scope: business credentials only, initially separate residential-license and contractor-registration cohorts. Do not assume one credential equals one organization or one location, or that a filename excludes individuals. Qualifying persons, owners, personal contacts, insurance/bond details and free-text documents are not collection targets. Establish the exact header and business/individual discriminator before selecting rows. If the export cannot separate those roles safely, retain the gap rather than guessing from names.

## Source use and address boundary

The [DLI disclaimer](https://dli.mn.gov/about-department/about-dli/disclaimer) describes its information/documents as public domain, requests source attribution, discourages rehosting documents instead of linking, disclaims completeness of external links, and prohibits implying endorsement. This supports investigating the publisher-offered downloads; it is not a blanket claim of redistribution rights for every field or an approval to publish personal information. Preserve attribution and source links, keep prospective raw evidence internal, and review complete current notices before app dispatch. Do not add a fictitious contract or account requirement merely because a notice exists.

The export's address roles and coordinates remain uninspected. A licensee's mailing or residential address must not automatically become a public operating site. Preserve an unresolved address role until evidence supports one. ZIP5 and ZIP4 must be separate; retain leading zeros. Businesses need nullable address latitude/longitude only, never newly attached polygons or county-centroid substitutes. The existing four governed polygon layers are unchanged.

## Bounded next implementation

1. Build a fixed-endpoint header prerequisite with byte/timeout/cancellation limits and no record retention. Treat HEAD length, ETag and Last-Modified as hints; separately measure and hash any later authorized response. Fail if a server ignores a bounded range rather than consuming a whole file as a schema sample.
2. Pin exact header, encoding, quoting, identifier/status/type fields and address semantics. Determine whether the documented business/individual distinction is representable; unknown or personal credential classes must not become business counts.
3. Establish an acquisition policy and field allowlist from that observed contract. Keep register/license status, observation time and publisher dates separate; absent rows are not closures. Test multi-credential organizations, non-Minnesota addresses, missing ZIP/points, partial files and changed source bytes.
4. Implement run-isolated retention, source hashing, normalized/quarantined row conservation, independent verification and native app receipts before enrollment. Co*Tive owns any subsequent download, not a monitoring agent. There is no new schedule or record acquisition in this assessment.

This evidence narrows Minnesota's next work to a documented download contract instead of portal scraping. It does not establish that construction or Minnesota is covered. Rollback is documentation-only and preserves all existing source releases, assessments, schedules and production jobs.

Repository verification: `npm run check` passed all 977 tests, lint, web/desktop builds and desktop control-plane smoke; `npm audit --omit=dev` reported zero vulnerabilities. The observation JSON was parsed and its two HEAD-only records checked. These checks protect the unchanged application; they do not verify the uninspected Minnesota export schema. Log: `data/tmp/mn-construction-assessment-check.log`. Local preview restored; no browser visual QA performed.
