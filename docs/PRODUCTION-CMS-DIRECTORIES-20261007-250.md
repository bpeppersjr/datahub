# Proposed retained-data production reconciliation — October 7, 2026

Plan 250 supersedes planning-only Plan 249 after implementing the deterministic conservative California childcare normalization contract. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-250`
- Plan confirmation SHA-256: `dc853640579ae4247f77d721f681de0678567b85145d43643d6cfb29438402b4`
- Plan file SHA-256: `c3b034794a6222c043062e99d0aa56d33e063e4428426c0496db9563765e3fce`
- Predecessor plan: `production-cms-directories-20261007-249`
- California normalization connector SHA-256: `de80a19791cbfb312e790a2e1f6f15966b893e3f1aa8cdf20df1aaadfd887fa3`
- California internal source policy SHA-256: `edc106530af52816a0a486ba2a68e8a4eac1583ab63c941868cfac5923f8aaca`

The normalizer converts verified selected DataStore rows into internal publisher-listed source candidates. It retains source-native facility type, facility number, name, address, county, regional office, capacity, status, first-license date, closed date, and file date with record- and release-level provenance. It creates release-scoped source IDs without treating them as canonical business identities.

ZIP5 and ZIP4 are separate. Missing and invalid source ZIP values remain explicit quality gaps; no USPS validity or Census ZCTA membership is inferred. Coordinates are null because the selected source supplies none. Publisher facility status and dates remain evidence, not independent proof of current operation. Facility addresses are not promoted to verified sites. Ownership, network affiliation, identity matching, production admission, and public export all remain false.

Focused tests passed for representative normalization, temporal parsing, facility-number preservation, split postal fields, missing/invalid geography, out-of-state reporting, null geocodes, conservative claims, source-row conservation, status aggregates, cancellation, duplicate detection, private-field rejection, resource identity, connector registration, and control-plane startup. Connector validation, lint, and web/desktop builds pass. No live provider request or provider-row acquisition occurred.

The normalization engine does not yet publish an immutable normalized release or connect that release to the California app terminal receipt. Those remain the next implementation boundary. No reporting or national admission is claimed.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,637,224,448 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider request, provider-row acquisition, normalized release publication, production enrollment, public export, or mutable source pointer write occurred. Plan 249 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-250 --expected-plan-sha256 dc853640579ae4247f77d721f681de0678567b85145d43643d6cfb29438402b4
```
