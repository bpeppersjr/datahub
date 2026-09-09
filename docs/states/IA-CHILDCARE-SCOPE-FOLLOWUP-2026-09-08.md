# Iowa childcare scope follow-up - September 8, 2026

Documentation-only follow-up to the root agent's schema assessment. No provider API requests, searches, exports, individual records, accounts, agreements, or contacts were made in this workstream. The root's aggregate observation of 3,201 mixed rows and 1,476 `building` values was supplied as context, not independently remeasured here.

## Center display meaning

The publisher-linked [Child Care Search User Guide](https://iachildcareconnect.org/wp-content/uploads/sites/2/2024/08/Child-Care-Search-User-Guide.pdf), updated August 22, 2024, identifies the center map icon as licensed child care centers or preschools (page 10). Its Type of Care filter documentation defines Center as a licensed center/preschool in commercial space, versus Home for registered development homes or non-registered homes with a Child Care Assistance agreement (page 13). The root integrator separately reports current client verification before and after its native schema request: 84,473 bytes, SHA-256 `ac4732c23c25983148de71876f4a50201bd58032d942325fd71694b7fc2df9cc`; center-icon branches at lines 730/743 and center/home filtering at lines 1479 onward use `pin.businessType === 'building'`. Combined guide and client evidence supports the center/preschool display-class meaning without requiring the internal token to appear in the guide. This agent did not repeat that client request. Do not drop preschools silently or relabel the display class as independently verified active businesses.

The [Iowa HHS childcare page](https://hhs.iowa.gov/programs/programs-and-services/child-care) distinguishes licensed centers from home categories and describes two-year license renewals and annual monitoring. That explains the licensing class, not the actual license validity or present operation of each map entry.

## Freshness and status boundaries

[C3's About page](https://iachildcareconnect.org/about/) describes a multi-source operational data system managed by Iowa State University and funded by Iowa HHS through the Child Care and Development Fund. It combines provider systems, CCR&R, and state agencies with near-real-time updates. This supplies attribution and provenance context, not a per-record timestamp contract or guaranteed map refresh schedule.

The [Vacancy Dashboard's Terms and Conditions section](https://iachildcareconnect.org/vacancy-dashboard/) defines reporting in terms of vacancy updates within 60 days. Its at-capacity category includes providers without recent vacancy reporting; this is not proof of actual full enrollment. It also distinguishes provider-reported operational capacity from legally licensed/registered capacity and describes fallback to the latter when operational data is stale. These definitions govern that dashboard: do not assume the map applies the same rules without checking its implementation. The same page records a dashboard change on October 9, 2025, warning that earlier accessed data can differ.

Consequently, retain source observation time separately from publisher update time; keep operating status unknown until an actual status field and its meaning are established. Absence of openings, non-referral, quality rating, or a map icon is insufficient to establish closure or current operation. Respect intentionally hidden non-referral details.

## Use and remaining prerequisites

The observed C3 pages provide public search/dashboard instructions and data definitions. Their Terms and Conditions heading did not supply a bulk redistribution license, explicit automated-request limits, or a specified attribution format. No inference of prohibition follows from that absence, and no broad public-domain grant is inferred either. Do not import unrelated HHS medical-code copyright notices or secure-vendor integration agreements into this public source's policy.

For a production connector: preserve the current `building` binding, define a precise retained field whitelist, identity and duplicate handling, numeric-ZIP conversion validation without fabricating ZIP4, acquisition limits, and a reviewed internal retention/export policy. Unknown publisher clocks, status semantics, and coordinate reference are explicit quality gaps, not automatically reasons to prohibit an otherwise authorized bounded source-layer acquisition. Retain unknowns and avoid unsupported derived claims. Attribute C3, Iowa State University, Iowa HHS, and source URL/release evidence as provenance; that is a conservative implementation choice, not a claim of a mandated attribution formula. Keep national completeness and verified-active counts unmeasured. Handoff routine acquisition only after app implementation and a persisted operation receipt.

This bounded pass inspected public HTML and the relevant guide text. PDF screenshot requests were made but yielded no model-visible page images, so no visual-icon inspection is claimed. No executable files were changed or runtime tests needed for this note.
