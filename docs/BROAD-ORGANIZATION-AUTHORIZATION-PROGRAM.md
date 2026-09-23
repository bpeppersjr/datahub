# Broad-organization all-wave authorization program

This is a separate dataset derived offline directly from the verified broad-organization acquisition backlog. It preserves the backlog order as five contiguous waves: AK/DC/IL/MS/AR/KY/HI/KS/NV/UT; WA/TX/OK/AL/AZ/CA/GA/ID/IN/LA; MA/MD/ME/MI/MN/MO/MT/NC/ND/NH; NJ/NM/OH/RI/SC/SD/TN/VA/VT/WI; and WV/WY/NE. The release contains 43 jurisdictions and 371 gate items covering 28 exact gate keys. The existing ten-jurisdiction authorization-packet release remains a separate unchanged artifact.

Each state retains its complete validated assessment snapshot, including exclusions, status and address evidence/limitations, publisher/product/access/price details, provenance, and official URLs. This is an evidence-specification program only. It is not source acquisition approval, a request to contact a publisher, or a production input. It performs no external action, changes no pointer, and carries no authority to contact, download, pay, request records, or publish production data.

Ordinary gates are non-row-bearing contract-evidence specifications. Reviewing documentation can establish only contract-evidence sufficiency; it cannot grant action authority. AK and DC `large-acquisition-authorization` are different: they are approval-only gates, not documents or uploads. No document can close them. Closure requires a separate authenticated, scope-specific user authorization for an exact reviewed proposal. The program itself grants none.

The immutable manifest-last release is content-derived beneath `data/broad-organization-authorization-program/releases/`. No current pointer is created. The verifier independently verifies the canonical backlog release and assessment catalog lineage, reconstructs exact waves, gates, exclusions, and authority boundaries, and rejects changes, extra files, linked/hard-linked artifacts, or changed lineage.

```powershell
npm run broad-org-authorization-program:build
npm run broad-org-authorization-program:verify
```

An exact backlog manifest can be selected with `--backlog-manifest <path>`; output can be directed only to a child of canonical `APP_ROOT/data`. Build and verify are offline and do not request, fetch, or inspect source records.
