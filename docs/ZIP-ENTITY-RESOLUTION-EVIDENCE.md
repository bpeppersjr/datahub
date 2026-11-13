# ZIP entity-resolution evidence

This is a separate pointer-free aggregate index. It does not add a dimension to or modify the national exact-ZIP industry matrix. Selected release `zip-entity-resolution-evidence-595b8001d70664c3a1c166bcefb78e90c8107e7abc7f6b3b56ccc3e64a5885c2` has manifest SHA-256 `1fec8db433fef8c083b8870935f9e8c7b08f9f7ef25dbde33b90762a564803bb`. Its input is the retained entity-resolution release `business-entity-resolution-20261112-025152257Z-75c216bb` (manifest SHA-256 `a5f2e82fe0cbe7d4ddb248f9c27660bb516ef7b23080d4e269fb1426554af881`). The release is replayed against the retained national registry manifest `657af52b4fb0cf0d7d00d775f6137acd98499e774937ad5d3d7ab1d82f493048`, ZIP cohort manifest `30a5027eb2cce3c21ed5f01743419559eb8739bf0498c6b6cd9570a1ecafe2b1`, and benchmark manifest `78620bf22f6bf002aa5472ae1159a1be11d7d208fe525e2a9d3da982f79d35e9`.

The aggregate conserves 2,325,053 physical-site alias memberships in 876,076 groups across 26,920 ZIPs, 146,828 establishment alias memberships in 72,122 groups across 13,088 ZIPs, and 106,431 unapplied review candidates across 14,585 ZIPs. Their union contains 26,920 ZIPs; 21,274 cohort ZIPs have no retained linkage decisions. Review ZIP attribution is accepted only through an address-match hash that resolves uniquely to physical-site automatic evidence in the same pinned partition; this release yielded zero unresolved or conflicting hashes and zero out-of-cohort decisions. Two groups skipped for size remain global/unlocalized and are not assigned to a ZIP.

Each output bucket contains only ZIP5 and counts/status. It contains no names, source-profile IDs, or decision/member IDs. The bounded 100-bucket lookup has a 1,000,000-byte cap checked before allocation; the built release maximum was 324,550 bytes. The release is retained locally under ignored `data/`; Git contains the registration pin and reproducible builder/verifier, not generated release payloads.

These are linkage-evidence membership/group counts, not unique businesses, current operations, or deduplicated business totals. `decision_status: active` is alias lifecycle state only. No aliases are applied, and no source label or production pointer is changed. The benchmark gate remains false and export remains unauthorized. A ZIP with no retained decision is not evidence that its entities are unique or unmatched. The upstream local-review-only/personal-data boundary is preserved; this derived aggregate does not grant record-level access or redistribution rights.

The ZIP inspector displays this evidence separately and links to the existing benchmark review UI under Operations → Evidence. Benchmark review remains a separate workflow and is not approval to apply aliases.

Rebuild or verify offline from retained inputs:

```powershell
npm run zip-entity-resolution-evidence:build
npm run zip-entity-resolution-evidence:verify
```

The build validates all 100 source decision partitions and the exact source registrations/manifests before publishing an immutable successor. It performs no network request, source acquisition, identity merge, benchmark approval, export authorization, production enrollment, or pointer update.
