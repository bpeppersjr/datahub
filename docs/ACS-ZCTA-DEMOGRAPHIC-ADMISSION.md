# ACS ZCTA demographic admission prerequisites

This module is a fail-closed, read-only contract inspection. It cannot ingest source rows, create staging storage, publish a release, write a pointer, or enroll anything in production. The repository currently has no retained trusted official ACS group-metadata release, approved structured source receipt, or immutable governed ACS source release. Those are explicit blockers, not caller-supplied assertions.

The offline candidate-row validator is also fail-closed. It requires one exact five-digit ZCTA and the complete 189-cell roster across the four reserved groups. Every cell must contain exactly raw `E`, `M`, `EA`, and `MA` values; numeric values remain strings, negative sentinels are preserved verbatim, annotations remain distinct, and missing values are represented only as `null`. Missing, extra, coerced, blank, or control-character values are rejected. Validation creates no receipt, staging directory, release, pointer, or authorization state.

`config/connectors/acs-zcta-demographic-admission.json` registers this narrow capability with Co*Tive's connector catalog. It has no allowed hosts or secrets, declares zero network requests, and is explicitly production-disabled. The canonical lifecycle shown by the catalog is the future governance boundary, not a claim that acquire, durable admission, normalization, publication, or finalization is implemented.

The contract reserves four ACS 5-year detailed-table groups: `B01001` sex by age (cells 001–049), `B02001` race (001–010), `B03002` race by Hispanic or Latino origin (001–021), and `B04006` ancestry (001–109). Every eventual cell must preserve the estimate (`E`), margin of error (`M`), estimate annotation (`EA`), and margin-of-error annotation (`MA`). Raw negative sentinels and annotations must be preserved, but their meanings remain explicitly unresolved until trusted official metadata is retained. No sentinel meaning, percentage, or lineage reinterpretation is invented.

Inspection independently replays the checksum-pinned policy, empty official-metadata registry, empty authorization registry, geography manifest, and every row of the governed 2020 Census ZCTA JSONL through a descriptor-bound stream. It enforces the absolute byte and line ceilings, exact checksum, exactly 33,791 unique five-digit ZCTA identities, and required geography/population/housing shape. Registry entries cannot imply availability until a future strict closed-schema validator exists; any entries are reported as unsupported or untrusted. ZCTAs remain Census statistical geography rather than USPS ZIP delivery boundaries.

Run the only supported mode with:

```powershell
node scripts/build-acs-zcta-demographic-admission.mjs inspect
```

The CLI rejects publish, declaration, unknown, duplicate, and missing flags. A future publish implementation requires a separately authorized increment that first retains exact official Census group metadata (including labels, concepts, universes, and variable/annotation rosters), an approved structured receipt, and immutable governed source releases. No sample or self-asserted metadata may unlock publication.
