# Proposed retained-data production reconciliation — October 7, 2026

Plan 255 supersedes planning-only Plan 254 after exposing checksum-pinned California childcare aggregate publisher-status readiness in Administration. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-255`
- Plan confirmation SHA-256: `7861c49e3f7d16044ec435207ee7907446c59dc68ecc6beaf294f7c37645568d`
- Plan file SHA-256: `a8d794184165629935898777deb5aa21c31e316f3719d4a712e7508a115a0b36`
- Predecessor plan: `production-cms-directories-20261007-254`
- Status-readiness implementation SHA-256: `cd0deababffc17982f2b4d25c07ae2cf2f03382bdf9e3257a040654c31f764f5`
- Administration implementation SHA-256: `9de4036c4c85f159d1ec2efae4d94382f1b27afaf8eded9455ee02e267ef11eb`

The new read-only view verifies the exact retained aggregate-only status preflight and its manifest SHA-256 before reporting 39,184 publisher rows across the five closed publisher labels. It reports 28,109 `LICENSED` or `ON PROBATION` rows only as publisher-open-status lifecycle-review candidates. Provider rows acquired remains zero; current operation remains false; business count and statewide completeness remain null. It is not reporting enrollment and does not alter industry coverage, production, acquisition, ZIP geography, or dispatch.

Focused status, lifecycle, reporting, and Administration tests passed. Lint completed with zero errors and seven existing warnings. Web and desktop builds and the 108-connector/83-policy registry check passed. `npm audit --omit=dev` continues to report the two known high-severity transitive advisories in `sharp` and `source-map-js`; no automatic dependency rewrite was performed.

Read-only production preflight returned `READY`, revalidated every pin, and reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections remain pinned with `national-12g`. Available disk was 73,517,268,992 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, publisher request, provider-row acquisition, enrollment change, public export, schedule activation, or mutable pointer write occurred. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-255 --expected-plan-sha256 7861c49e3f7d16044ec435207ee7907446c59dc68ecc6beaf294f7c37645568d
```
