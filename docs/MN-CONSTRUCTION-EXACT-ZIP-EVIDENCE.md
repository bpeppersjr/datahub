# Minnesota construction exact-ZIP evidence

The registered local-only projection replays the immutable retained Minnesota DLI residential-construction credential release and groups its publisher business-credential rows by source-reported ZIP5. It performs no acquisition, network request, geocoding, identity matching, matrix rebuild, pointer update, or production enrollment.

The source contains 11,456 accepted credential rows. Exactly 11,455 report ZIP5 and one retains a missing ZIP5 gap. ZIP+4 remains a separate field and is never joined or aggregated. Counts are publisher credential rows, not unique businesses, physical sites, establishments, current operations, or an all-business denominator. `Issued` is preserved as publisher status at the retained observation time and does not establish present operation. Reported addresses have an unresolved role and can be administrative or residential. Record-level evidence remains `local-review-only`; public export is not authorized.

The projection is admission-ready evidence only. It does not mutate the registered national exact-ZIP matrix or claim that Minnesota's broad-organization gap is complete. Run `npm run mn-construction-exact-zip:verify` for full offline replay of the pinned selection, source manifest, credential artifact, and source policy.
