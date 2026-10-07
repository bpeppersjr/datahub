# Proposed retained-data production reconciliation — October 7, 2026

Plan 254 supersedes planning-only Plan 253 after adding conservative California childcare lifecycle qualification. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-254`
- Plan confirmation SHA-256: `78bee2ac33c913716c40c293aa256d64116cf0ee70a903da080bc739b8653c48`
- Plan file SHA-256: `76900b0677ac92c215d9ad73b01ae2d7f73f152ebb7fe30dbbce48591c88e6f9`
- Predecessor plan: `production-cms-directories-20261007-253`
- California lifecycle qualification implementation SHA-256: `d924766444750a77d8104efe8112edf530eb25b33de6b5d09ceabb5a3aed48ad`
- California reporting implementation SHA-256: `34e5977a9fbdca1ddcbf8e3301ca702fba99c11c333c40a4b595ed647b776c80`

The reporting reader now partitions every accepted California childcare source-candidate row by a closed lifecycle vocabulary and explicit date-quality states. `LICENSED` and `ON PROBATION` remain publisher-open-status candidates, `CLOSED` and `INACTIVE` remain publisher-nonopen statuses, and `PENDING` remains pending. Parsed closed dates paired with open-candidate or pending labels are isolated as contradictory publisher evidence. Unknown statuses fail closed.

This qualification does not assert a current active business, verified physical site, complete geocode, national completeness, or all-business denominator. It adds status visibility while preserving the user's direction that unavailable denominators, geocodes, industry completeness, and unresolved non-ZCTA geography must not block other application views. Administration maintenance selection remains independent from reporting evidence and grants no acquisition authority.

Focused California lifecycle and reporting tests passed, followed by the full California test group and Administration UI contract: 33 tests passed. Connector validation passed for 108 connectors and 83 policy profiles. Lint completed with zero errors and seven existing warnings. Web and desktop builds passed. `npm audit --omit=dev` continues to report the two known high-severity transitive advisories in `sharp` and `source-map-js`; no automatic dependency rewrite was performed.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain pinned with the `national-12g` profile. Available disk was 73,522,532,352 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, publisher request, provider-row acquisition, enrollment change, public export, schedule activation, or mutable pointer write occurred. Plan 253 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-254 --expected-plan-sha256 78bee2ac33c913716c40c293aa256d64116cf0ee70a903da080bc739b8653c48
```
