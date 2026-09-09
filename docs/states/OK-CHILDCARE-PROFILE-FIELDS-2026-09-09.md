# Oklahoma profile-field validation

This bounded follow-up resolves part of the address/status contract missing from the [managed search-schema prerequisite](OK-MANAGED-SCHEMA-PREREQUISITE.md). It does not acquire a provider dataset, enroll detail traversal, or establish statewide coverage. Ordinary public profile inspection follows the publisher's public-program lookup purpose; inspection reports, narratives, contacts and third-party map services remain outside the intended retained business fields.

## Static evidence

The publisher's build manifest links the detail-page asset `https://childcarefind.okdhs.org/_next/static/chunks/pages/providers/[vendorId]-82c8631bbc6c6c92.js` (8,583 bytes, SHA-256 `33f525f6ae8d66edbc2b6ff30c247278bbd67660598bce5c9670b797a7467e04`) and shared chunk `https://childcarefind.okdhs.org/_next/static/chunks/722-c3721ea7f0928daa.js` (30,391 bytes, SHA-256 `69efbbfc6fdc9476f92b0cc0b718596f655a68d5a5d13f9d29c3460a13cf87dc`). Their source text was inspected without execution.

The profile receives `denialSent`, `revocationSent` and `emergencyIssued`, which were absent from the search-row schema. The shared banner uses the exact string `True` to select notice displays; the contact component takes two `addressLines` elements. These are client display semantics, not proof that a licensing action has become final or that a listed business is open or closed. Neither notice presence nor absence must be converted into an active-business assertion.

## Native bounded observation

At `2026-09-09T06:21:44.225Z`, a diagnostic requested the ordinary center-only ZIP 73102 search, then followed only its first displayed center-profile link. The source `vendorId` was validated, the exact profile href was required in the search HTML, and the returned detail route/query had to match that identity. No ID enumeration or guessed detail link was used. Both serial requests rejected redirects, used no credentials, and had 20-second/1-MB limits; the search was capped at 100 rows. No scripts, maps, reports or detail-page links were executed or followed.

- Search: four rows, 28,961 decoded bytes, SHA-256 `a041482e896aaf22107f734aa22b7ec66718564fb9819478132ad0d9504f6987`.
- Profile: 31,921 decoded bytes, SHA-256 `11175f905b2fd8981a0a086fd69d346e0d6c436fc5068c606a4397bfd9fabcb1`.
- The three notice fields were strings with the exact value `False` in this one profile.
- `addressLines` contained two nonempty strings. The second matched a terminal city/comma/uppercase-state/ZIP5 pattern; no ZIP4 was present. The two source lines exactly matched the selected search row's lines.
- The profile exposed no explicit operating-status or update-time field in the observed top-level schema. It did contain mixed business/contact/monitoring fields; only field-name/type metadata and the stated aggregate format checks were emitted. Provider values, raw HTML, contact values and narrative arrays were discarded, not retained as source evidence.

The search-body hash differs from the earlier bounded run; no row-level change or reason is inferred from that alone. These checksums identify transient responses and cannot replay their discarded contents. One matching address example does not establish universal formatting, physical-premises accuracy, ZIP assignment validity, or an active license. The selected provider's identity/path is intentionally absent from this aggregate note.

## Conservative reusable field helpers

`runner/ok-childcare-profile-fields.mjs` supplies pure, offline parsing helpers for a future source normalizer. It is not wired into source acquisition or national reconciliation by this increment.

The address helper retains a bounded copy of source lines and recognizes only the evidenced two-line pattern: one nonempty reported street line followed by city, uppercase U.S. state/DC abbreviation and ZIP5. Optional hyphenated ZIP4 support is synthetic-tested extension behavior, not something observed in this profile. ZIP5 remains a string in `zip_code` and ZIP5-only `postal_code`; `zip4` is separate and nullable. Unrecognized present formats remain parsing-unresolved, not falsely missing. The parser never substitutes the queried ZIP, infers Oklahoma from the publisher, or verifies physical premises. Oversized or unsafe input shapes produce a fixed rejection reason rather than echoing arbitrary input.

The notice helper accepts exact string `True` or `False` for each of the three named fields, otherwise marks that flag unknown. It does not coerce booleans, case variants or arbitrary strings. It always leaves active-business verification false and the source operating-status interpretation unavailable. Unknown raw flag values and unrelated fields are not copied into the output.

## Next acquisition step

Use these helpers only inside a separately verified, source-bound collector that preserves source-native business fields and provenance. Validate broader delivery/completeness, identifier lifecycle, retained-field policy and temporal semantics before statewide execution. Do not fetch profiles merely to turn absent notices into an active status. Unknown status is a quality gap, not a reason to discard an otherwise usable source listing.

No production plan, source enrollment, national pointer or retained dataset is changed. Rollback removes the new helpers/tests and this note without deleting retained evidence. Release verification is recorded in the development roadmap.
