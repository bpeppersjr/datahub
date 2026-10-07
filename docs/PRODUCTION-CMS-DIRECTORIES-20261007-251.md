# Proposed retained-data production reconciliation — October 7, 2026

Plan 251 supersedes planning-only Plan 250 after implementing manifest-last immutable publication and independent replay for normalized California childcare evidence. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-251`
- Plan confirmation SHA-256: `c51e01187cf77a0c06a70de4e11c5b54626838e67ff02ea92d87b9621ee2cb0f`
- Plan file SHA-256: `6e58f947344fdb8f4bb659ee8de72f9b81a4aca1f13594ab296da43060cf1b74`
- Predecessor plan: `production-cms-directories-20261007-250`
- California normalization connector SHA-256: `79110dcd0fb1363a9c72cdbb33bfa092fea56f70861e6669a1791a1e0c1d86bf`
- California internal source policy SHA-256: `d0d7439a590a38ff540357549d86c6e6aa2d8ea1f1f771bdd2aca4f88f064285`

The normalized release builder independently verifies its acquired input, reopens all 79 selected-field page artifacts, normalizes the 39,184-row cohort, writes normalized and quarantine JSONL plus a reconciled summary, writes the manifest last, and atomically publishes a UUID-owned immutable directory. It never writes a current or production pointer.

The verifier does not trust normalized output declarations. It revalidates the acquired release and pages, reruns the versioned normalization, recomputes the expected JSONL hashes, byte counts and record counts, verifies artifact bytes and inventory, and proves source rows equal accepted plus quarantined rows. The release retains null geocodes, split ZIP5/ZIP4, source status and dates, and all conservative non-claims.

Synthetic tests published and independently replayed the full 39,184-row cohort, verified zero coordinates and complete ZIP5 evidence in the fixture, rejected normalized-artifact tampering, honored pre-cancellation, rejected an unsafe output root, and proved no final manifest appears for cancelled work. No live provider request or provider-row acquisition occurred.

The remaining lifecycle boundary is connecting the verified normalized release to the California app operation and its terminal receipt. Lifecycle eligibility, ZIP/ZCTA reporting reconciliation, national admission, and public export remain unimplemented and unauthorized.

Connector validation, lint, and web/desktop builds pass. The two previously known high-severity transitive advisories remain reported by `npm audit --omit=dev`.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,634,648,064 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider request, provider-row acquisition, production enrollment, public export, or mutable source pointer write occurred. Plan 250 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-251 --expected-plan-sha256 c51e01187cf77a0c06a70de4e11c5b54626838e67ff02ea92d87b9621ee2cb0f
```
