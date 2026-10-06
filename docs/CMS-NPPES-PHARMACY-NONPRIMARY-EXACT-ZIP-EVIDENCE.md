# CMS NPPES pharmacy nonprimary exact-ZIP evidence

This registered read-only projection replays the retained CMS NPPES nonprimary pharmacy-address release into local aggregate exact-ZIP evidence. It performs no acquisition, network request, geocoding, identity matching, pointer update, matrix mutation, or production enrollment.

The retained source contains 420 provider-reported nonprimary practice-address rows across 377 ZIP5 values. All 420 rows have ZIP5; 369 also report a separate ZIP+4. ZIP5 and ZIP+4 remain separate, and missing postal evidence is conserved rather than converted to zero. These rows are reported address associations for organizations classified by pharmacy taxonomy. They are not confirmed pharmacy locations, physical sites, current operations, unique businesses, an addition to primary pharmacy counts, or a complete pharmacy directory. The projection exposes aggregate counts only under `local-aggregate-review-required`; it copies no names, NPIs, or street addresses.

Run `npm run pharmacy:nonprimary-exact-zip:verify` to replay the pinned pointer, immutable source release and governing aggregate policy. Successful verification establishes admission readiness only; the fixed national exact-ZIP matrix remains unchanged.
