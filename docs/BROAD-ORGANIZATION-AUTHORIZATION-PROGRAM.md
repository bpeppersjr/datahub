# Broad-organization current-gap authorization program

Version 2 is an offline evidence-specification dataset derived exactly from the verified current-gap acquisition backlog v2. It contains the 40 jurisdictions that still lack a production-ready general-business broad layer. Alaska and D.C. are deliberately absent because the current national matrix no longer reports them as gaps.

The four contiguous ten-state waves preserve backlog order:

1. IL, MS, AR, KY, HI, KS, NV, UT, WA, OK
2. AL, AZ, CA, GA, ID, IN, LA, MA, MD, ME
3. MI, MN, MO, MT, NC, ND, NH, NJ, NM, OH
4. RI, SC, SD, TN, VA, VT, WI, WV, WY, NE

The release contains 351 gate items across 26 exact gate keys. Each row retains its complete assessment snapshot, exclusions, limitations, official-source provenance, and explicit false authority fields. The manifest also pins the backlog and the backlog's independently verified national-matrix lineage. The builder and verifier perform zero network requests, source contacts, downloads, payments, record requests, pointer changes, or production actions.

The historical v1 release remains immutable and independently verifiable. It continues to represent its original 43-jurisdiction, 371-item, five-wave snapshot; its bytes, release identity, and backlog lineage are not rewritten. The older ten-jurisdiction authorization-packet release is also unchanged.

```powershell
npm run broad-org-authorization-program:build
npm run broad-org-authorization-program:verify
```

With no arguments, the scripts select the sole canonical v2 backlog or v2 program release. An exact historical or current manifest can still be verified by passing its path. Output is restricted to a child of canonical `APP_ROOT/data`, publication is manifest-last and content-addressed, and no `current.json` pointer is created.

This program is not acquisition approval. Reviewing a document can establish contract-evidence sufficiency only; it cannot authorize contact, access, payment, record acquisition, or production use.
