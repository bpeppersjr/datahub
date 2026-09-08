# Minnesota registrations: confirmed UTF-8 incompatibility

On September 8, 2026, a bounded source check found invalid UTF-8 in the registrations export. The fatal streaming decoder first rejected byte `0xA4` at zero-based offset **478,182**. The server reported the same ETag and full-file length as the failed registrations job's prerequisite: `"06cd86f3fdd1:0"`, 4,408,602 bytes.

The [recorded diagnostic](evidence/mn-registration-encoding-20260908.json) contains metadata, checksums and the decoding finding, not source rows. The check acquired only the first 1,048,576 bytes with an exact HTTP 206 range, `If-Match`, no redirects, no credentials, identity encoding, bounded response size and request deadlines. A subsequent HEAD matched the source version and size. The shared publisher gate and one-second request spacing were used. Two current publisher notices were checked before and after the diagnostic; their approved article hashes matched. Six requests were made; no retry was performed. The range and notice bodies were not saved by this diagnostic.

## Interpretation

The existing fatal UTF-8 source decoder cannot consume this observed source prefix. That is a demonstrated compatibility issue, not merely a suspected encoding problem. It is consistent with the failed registrations operation stopping after a retained ASCII prefix, but the historical job did not record a detailed error, so its exact failure remains retrospectively unproven. The residential export was not tested by this diagnostic; do not transfer the finding to that cohort without evidence.

An invalid UTF-8 byte does **not** establish Windows-1252, OEM, Latin-1 or another replacement encoding. The response declares `application/octet-stream`, not a charset. The official [license lookup instructions](https://www.dli.mn.gov/sites/default/files/pdf/ims-license-registration-lookup.pdf) describe export functionality and record types, but the reviewed material did not establish the encoding of this fixed CSV. No contact, agreement acceptance or account action was performed.

## Development consequence

Do not silently decode with replacement characters or guess a legacy encoding for business names and addresses. Next connector work should evaluate a versioned byte-preserving CSV framing boundary that keeps structural validation strict, validates selected field bytes explicitly, and records a finite rejected-row disposition for unresolved text. That approach needs source-byte measurement, field privacy, row-count conservation, split-chunk/quote tests and backward-compatible replay before enrollment. It must not reinterpret ambiguous bytes or claim complete coverage of excluded records.

The previous partial bundles remain incomplete and unpromoted. No new full acquisition, normalization release or national coverage gain is claimed. The next needed complete acquisition remains app-owned after the compatibility change is validated; this diagnostic does not authorize blind retries or change source policy.
