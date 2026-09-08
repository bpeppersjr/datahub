# Minnesota business-credential normalization

The pure `normalizeMnConstructionRecord` function implements the next step after the retained header/code prerequisites. It performs no requests, geocoding, publication, scheduling or cross-source matching. All tests use synthetic records; no actual full Minnesota export has been acquired or normalized.

## Reviewed source semantics

Official pages rechecked September 8, 2026:

- [DLI lookup and downloads](https://dli.mn.gov/license-and-registration-lookup) associates `Issued` with current active credentials and offers the two fixed construction exports.
- [Residential contractor FAQ](https://www.dli.mn.gov/business/residential-contractors/residential-contractor-faqs) distinguishes BC/CR/RR/MI business licenses from QB/QC/QR/QI personal qualification registrations. These identifiers are not organization primary keys.
- [Contractor consumer guidance](https://www.dli.mn.gov/workers/homeowners/tips-hiring-contractor) distinguishes IR contractor registration from licensing. Registration does not establish the protections associated with a license.
- [DLI disclaimer](https://dli.mn.gov/about-department/about-dli/disclaimer) states public-domain information, attribution expectations, direct-document linking and non-endorsement boundaries. This is reviewed documentation, not an archived fresh-notice package or blanket permission to publish personal fields. No account, agreement or outbound inquiry was created.

The source does not yet provide a verified address-role mapping. This does **not** block organization/credential normalization: preserve a reported address with unresolved role and exclude it from physical-site and matching inputs. It remains a blocker to claiming verified operating locations, not a reason to discard every business credential or invent a permission requirement.

## Input and output contract

Input is an already parsed object with the exact 18-column export roster. Only literal `Business` plus literal `Issued` is eligible. Six-digit BC/CR/RR/MI identifiers are accepted in the residential cohort; six-digit IR identifiers in the registration cohort. Unknown markers, malformed or personal prefixes, other statuses and cross-cohort credentials receive fixed rejection reasons before names or addresses are read. This narrow accepted grammar may exclude valid unusual records; a future release ledger must report those gaps instead of silently counting them as absent businesses.

The function selects business/DBA name, reported address, credential identity/status and unparsed original/expiration date strings. It never reads or hashes phone, email, enforcement, renewal, license-type or subtype values. The prefix supplies the supported credential classification; unsupported classes are rejected rather than inferred from an unrestricted description. An empty business name, unsafe controls or oversized selected text are rejected without echoing values.

Each output binds the supplied run ID, source release ID, canonical UTC observation, fixed cohort URL, one-based data-row ordinal (excluding the header), input file checksum and selected-fields checksum. The caller must measure the file checksum while acquiring the source and bind it to the retained selected-source release. This function validates provenance shape, not the authenticity of a caller-supplied checksum or the existence of a release. It does not hash or retain complete raw records containing contacts.

Dates remain explicitly unparsed publisher strings, never asserted business opening/closure dates or validity intervals. `Issued` means publisher-reported active credential at observation, not independently verified active business operations. Separate records sharing a name remain separate credentials with distinct row IDs; no unique-company count or affiliation is inferred.

`reported_address` is never named `physical_address`. PO boxes are allowed as reported addresses but are ineligible as physical sites. Missing addresses do not discard otherwise eligible credentials. Recognized U.S. state/territory/military codes support a source-code-based country assertion, not polygon validation; other region codes remain intact with country null. Out-of-state addresses are not rewritten to Minnesota. ZIP5 and ZIP4 accept separated or compact numeric source syntax, retain leading zeros, and are emitted separately. Invalid/unknown postal values produce null normalized postal fields and a quality gap; they are not claimed to be validated USPS assignments. Original selected values remain the future selected-source layer's responsibility.

Latitude and longitude are null because the export has no coordinate fields. Businesses receive no geometry, centroid or county assignment. Industry is construction-program membership, not a fabricated NAICS code. Parent company, unique identity, operating-site eligibility and matching eligibility are unresolved/false. All record-level output is local-review-only.

## Remaining native handoff

Implement the source-use/retention profile, privacy-selected streaming acquisition with measured hashes and immutable run isolation, disposition conservation, independent release verification and native Co*Tive enrollment. Every source row must become either an accepted credential or an explicit rejected disposition; missing records on a later refresh must not imply closure. Retained selected rows must support replay without another download. Only an accepted app operation receipt completes the acquisition handoff.

Five offline tests cover accepted classes, row identities, address/postal uncertainty, excluded getters and hashes, person/status rejection before private field access, redacted diagnostics, provenance and duplicate-name/multiple-credential boundaries. Rollback is code-only: remove this module and tests and preserve earlier prerequisite receipts. No production implementation pin or source policy was changed.

Verification on September 8, 2026: full `npm run check` passed all 1,001 tests, lint, web/desktop builds and desktop control-plane smoke; `npm audit --omit=dev` reported zero vulnerabilities. Independent review identified checksum type coercion; the primitive-string guard and array/custom-object rejection regressions pass. Full-check log: `data/tmp/mn-construction-normalization-check.log`. All 82 code/configuration pins in pending plan `production-oh-memory-20260908-02` were verified unchanged. Local management preview restored; no browser visual QA or native Minnesota acquisition was performed.
