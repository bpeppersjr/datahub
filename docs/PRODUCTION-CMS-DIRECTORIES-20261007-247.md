# Proposed retained-data production reconciliation — October 7, 2026

Plan 247 supersedes planning-only Plan 246 after implementing and testing immutable acquired-release publication for the bounded California CDSS childcare DataStore engine and clarifying the application's nonblocking geography and industry-status contracts. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-247`
- Plan confirmation SHA-256: `426be9cedac92553cd6d93e61995a38a6013855d84a10ff18ad5313722c3cc04`
- Plan file SHA-256: `2b7c2e9f7e7de583fc113a3697579151983ebc933734f1d2d15d5482d823c6c2`
- Predecessor plan: `production-cms-directories-20261007-246`
- Acquisition connector SHA-256: `422241c4896fb8ee637fd50766671e515169674d89fca1094a2f9a254c944004`

The acquired-release writer creates a UUID-owned staging directory, writes the prerequisite receipt and 79 selected-field page artifacts with restrictive permissions, writes acquisition evidence and a checksummed manifest last, and publishes through an atomic directory rename. It never overwrites an existing release. The independent verifier reopens every declared artifact, checks byte counts and SHA-256 values, replays all 39,184 retained rows through the privacy and ordering validator, and proves the 83-request, 79-page, two-resource conservation contract.

Synthetic transport tests published and independently verified the complete release, proved that a tampered page fails integrity verification, and proved that a request failure cannot publish a final manifest. No live provider-page request or provider-row acquisition occurred. The application-owned job operation, exclusive publisher lock, restart/resume behavior, normalization, admission, and production enrollment remain unimplemented.

The State Evidence interface now states that private or unique ZIPs, zero-population delivery areas, parks, tribal lands, private property, and other non-ZCTA space never block the map. Existing topology-verified residual artifacts preserve state-equivalent placement without inventing ZIP or special-land classifications. Industry Summary continues to report retained access evidence, temporal state, and provenance across 51 jurisdictions without requiring an all-business denominator or complete geocodes. Administration continues to persist maintenance intent for the nine governed industries; selection grants no acquisition authority.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,914,085,376 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, provider-page request, provider-row acquisition, production enrollment, public export, or mutable source pointer write occurred. Plan 246 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-247 --expected-plan-sha256 426be9cedac92553cd6d93e61995a38a6013855d84a10ff18ad5313722c3cc04
```
