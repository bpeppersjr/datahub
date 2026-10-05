# Business-entity source-policy provenance

The registered pointer-free `business-entity-source-policy-provenance@1.0.0` release is a 15-row inventory for the retained national registry's 8,011,835 location profiles. It binds each exact source to its dataset registration, selected source manifest, raw-byte policy profile, lifecycle taxonomy policy hash, and temporal semantic policy hash. Embedded source-manifest policy objects are recorded separately from raw policy-file hashes; an absent embedded policy is an explicit value, not an inferred match.

The current selection is `business-entity-source-policy-provenance-c43ddd5a681702e77c1446a31bdd07264a6a206a5435947d353e0d7c3e3ed098` (manifest SHA-256 `4706f9cb6bfaf9ff11b488c8bb692172ec46e2ea85847c07571e1a0e7efbce54`, artifact SHA-256 `be3ae723b0728ff161e0764233bfae7888222fc8f0b1768bad70635d5a378534`). It is retained locally under ignored `data/`; generated release bytes are not Git payloads.

Rebuild and verify offline with `npm run business-entity-source-policy:build` and `npm run business-entity-source-policy:verify`. The lifecycle full verifier also replays every profile and rejects a source ID/release/policy ID or profile export-policy mismatch. The objective-readiness API includes this inventory as an integrity-only achieved requirement; authorization, acquisition authority, current-operation verification, eligibility, export authority, and objective acceptance remain unchanged and false/unaccepted.

The builder performs no network requests, acquisition, production enrollment, or pointer writes. Local-review-only versus public profile export classifications are preserved exactly and do not imply broader source-use authorization.
