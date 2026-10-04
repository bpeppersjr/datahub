# ZIP entity-resolution evidence

This is a separate pointer-free aggregate index. It does not add a dimension to or modify the national exact-ZIP industry matrix. Its input is the retained entity-resolution release `business-entity-resolution-20260911-040411512Z-e6812503` (manifest SHA-256 `46ebfc2e1077663897d1507df1dbe4c958940e69f671b335ed884e7e8da602ff`). The release is replayed against the retained national registry manifest `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`, ZIP cohort manifest `792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea`, and benchmark manifest `d036a38d3808e59f1a35762dc980855fd3676d8ec75ab379c2e0c7968c2f484e`.

The aggregate conserves 2,325,194 physical-site alias memberships in 876,086 groups across 26,919 ZIPs, 146,896 establishment alias memberships in 72,158 groups across 13,083 ZIPs, and 106,063 unapplied review candidates across 14,585 ZIPs. Their union contains 26,919 ZIPs; 21,275 cohort ZIPs have no retained linkage decisions. Review ZIP attribution is accepted only through an address-match hash that resolves uniquely to physical-site automatic evidence in the same pinned partition; this release yielded zero unresolved or conflicting hashes and zero out-of-cohort decisions. Two groups skipped for size remain global/unlocalized and are not assigned to a ZIP.

Each output bucket contains only ZIP5 and counts/status. It contains no names, source-profile IDs, or decision/member IDs. The bounded 100-bucket lookup has a 1,000,000-byte cap checked before allocation; the built release maximum was 324,550 bytes. The release is retained locally under ignored `data/`; Git contains the registration pin and reproducible builder/verifier, not generated release payloads.

These are linkage-evidence membership/group counts, not unique businesses, current operations, or deduplicated business totals. `decision_status: active` is alias lifecycle state only. No aliases are applied, and no source label or production pointer is changed. The benchmark gate remains false and export remains unauthorized. A ZIP with no retained decision is not evidence that its entities are unique or unmatched. The upstream local-review-only/personal-data boundary is preserved; this derived aggregate does not grant record-level access or redistribution rights.

The ZIP inspector displays this evidence separately and links to the existing benchmark review UI under Operations → Evidence. Benchmark review remains a separate workflow and is not approval to apply aliases.

Rebuild or verify offline from retained inputs:

```powershell
npm run zip-entity-resolution-evidence:build
npm run zip-entity-resolution-evidence:verify
```

The build validates all 100 source decision partitions and the exact source registrations/manifests before publishing an immutable successor. It performs no network request, source acquisition, identity merge, benchmark approval, export authorization, production enrollment, or pointer update.
