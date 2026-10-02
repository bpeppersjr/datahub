# One-ZIP evidence envelope

The authenticated empty GET ZIP inspector retains its existing 1.0.0 fields and adds `qualification` and `operational_admission`. Qualification retains its own versioned schema, immutable release identity, exact coverage/registry manifest hashes, authored category mapping, policy and source rows. Counts are never added across these layers. Ordinary category contributions and qualification retain their separate mapping semantics.

The server reads the bounded ordinary indexes and qualification index, requires identical ZIP/category and coverage/registry release IDs **and manifest hashes**, then rechecks the ordinary source context after composition. Missing, corrupt or incompatible qualification is explicitly unavailable within the envelope; ordinary evidence remains independently usable. Cancellation propagates; the existing 120-second response deadline and legacy auxiliary cancellation limitation remain unchanged. No fallback scan, build, acquisition or publication is performed.

USPS metadata is read from the tracked candidate registration and candidate policy with bounded canonical reads, checksum bindings and final rereads. It describes the candidate-only scope, local restriction, admission prohibition, and lack of demonstrated current operation/deliverability. It does not establish licensed input availability, authorization, an admitted denominator, or a ZIP-specific USPS finding. Missing/invalid metadata returns scope comparison unavailable and null admission, not false certainty.

ZIP Economy supplies qualification directly from this response to its panel; it no longer launches the second qualification request. Retry reloads the inspector; ZIP/category changes cancel the previous inspector request and clear its result. The separate qualification endpoint and standalone panel mode remain compatible. Null and zero are preserved, and no client-side authoritative merge is performed.

Implemented by the dedicated supported Astra fallback. Focused verification only; full repository/runtime gate is deferred to integrator review.
