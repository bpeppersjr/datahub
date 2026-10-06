# Proposed retained-data production reconciliation — October 6, 2026

Plan 201 is a planning-only successor to Plan 200 after exposing the accepted report-only national ZIP objective in Business Intelligence, adding a governed registry source-freshness audit, and reconciling the registry's 199 denominator-only ZIP members against retained 2023 Census ZIP Business Patterns evidence.

- Run ID: `production-cms-directories-20261006-201`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-201.json`
- Plan confirmation SHA-256: `51c39b7a3d9d29bdec19441512c24e664c210ff2c58c4f0c2b30389b97a84ecc`
- Plan file SHA-256: `81ed9d1c897013b676fa1fa35e7f783eaf42aca51dde7b5e1cf652dd581ea0c0`
- Predecessor plan: `production-cms-directories-20261006-200`
- Implementation commit: the commit containing this document

The protected report-only ZIP objective endpoint replays the exact accepted `national-zip-goal-acceptance@1.7.0` claim and fails closed on schema, pin, conservation, admission, or null-claim drift. The Business Intelligence card independently validates its closed response and reports `48,194 = 47,995 + 199`, `14,403 = 14,361 + 41 + 1` explicit `00000`, a null USPS operational denominator with the candidate not admitted, null all-business completion, and a null current-operating-business count. It explicitly distinguishes this accepted retained-membership claim from the broader unaccepted active-business objective.

The pointer-free registry source-freshness audit proves that all 25 ready postal-migration sources have exact one-to-one release and manifest bindings in the current registry and byte-identical production and isolated-candidate pointers. It found zero changed, missing, or duplicate bindings, so a source refresh or download would not advance those inputs. The audit performs no build, pointer mutation, production action, candidate action, or completeness/current-operation assertion; all 85 registry dependencies must still be rechecked before any separately authorized replay.

`national-zip-business-evidence-alignment@1.1.0` preserves the registry's historical 199 denominator-only classification while reconciling those exact members against retained 2023 Census ZBP evidence. Fifty-seven have measured-positive employer-establishment evidence—16 same-code ZCTAs and 41 non-ZCTAs—totaling 281 establishments. The remaining 142 are same-code ZCTAs without published ZBP totals. Exact member and cross-class digests are pinned. This narrows retained evidence status only; USPS validity remains null, current operation remains unverified, and active-business completion remains null.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,758,007,296 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 200 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-201 --expected-plan-sha256 51c39b7a3d9d29bdec19441512c24e664c210ff2c58c4f0c2b30389b97a84ecc
```
