# California childcare retained reporting

`ca-childcare-reporting@1.1.0` is a read-only projection of one independently verified Co*Tive California childcare app receipt. It does not contact the publisher, create a current pointer, enroll national production, or publish record-level data.

The reader verifies the terminal receipt, acquired release, normalized release, and exact acquired-to-normalized lineage before streaming `normalized.jsonl`. It conserves the source, accepted, and quarantine counts and reports bounded aggregates by source-reported state, separate ZIP5, source resource, publisher status, and lifecycle qualification. ZIP4 remains a separate quality count. Geocodes remain absent, and source-reported ZIP5 is not treated as USPS validity or Census ZCTA membership.

Lifecycle qualification uses the publisher's closed vocabulary without asserting present operation. `LICENSED` and `ON PROBATION` are publisher-open-status candidates; `CLOSED` and `INACTIVE` are publisher-nonopen statuses; and `PENDING` remains pending. An open-candidate or pending label paired with a parsed closed date is isolated as contradictory publisher lifecycle evidence. Missing, invalid, and parsed dates remain distinct quality states. Unknown publisher statuses fail closed instead of being promoted or silently grouped.

The projection deliberately keeps these claims false or null:

- current business operation;
- unique business or facility identity;
- verified physical site;
- address verification;
- geocode presence;
- ZIP validity or ZCTA boundary assignment;
- national reporting integration or nationwide completeness;
- public export authorization.

`ca-childcare-reporting-enrollment@1.0.0` is an optional local binding containing only an app receipt path and exact SHA-256. Missing configuration means `not-enrolled`; a configured but unavailable receipt means `unavailable`, never measured zero. Only a deeply verified `fixed-native-fetch` receipt is eligible. Injected test receipts and retained-local-verification jobs cannot self-enroll.

The state-access ledger exposes eligible California evidence as local source-candidate evidence with a publisher-cohort denominator. It does not change the national business registry, the national industry denominator, state access status, or job-dispatch state. A future real enrollment must be added as a separately reviewed configuration change after a fixed-native app operation completes.
