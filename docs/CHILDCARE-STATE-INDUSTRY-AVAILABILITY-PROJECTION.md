# Childcare state-industry evidence availability

This pointer-free local projection uses only the registered retained childcare ZIP evidence release. It represents PA, CT, MD, VT, CO, UT, and IA as measured retained candidate cohorts. The other 44 states/D.C. are explicitly unmeasured; they are not zeroes.

The count unit is a retained source-candidate row. The projection conserves 12,206 rows as 12,205 ZIP-present, zero missing-ZIP, and one invalid-ZIP candidate. These counts are evidence availability, not a state or national reporting denominator, businesses, physical sites, current operations, USPS validity, or completeness.

The build performs no network request, acquisition, current-pointer write, or production enrollment. Releases are content-addressed immutable directories under `data/childcare-state-industry-availability-projection/releases`; registration pins one exact manifest and retains a null runtime pointer.

The registered hardened successor is `childcare-state-industry-availability-projection-db15ef4058400692898bda040f317057949323cb5fcaacd58d994eecc68c5322`; its manifest SHA-256 is `d16a222a0a1aea770dc63f73c450bb00ad2321df12ec293a1289cb187503a58a`. The projection preserves the bound source release's `created_at` only as source metadata and explicitly sets the derivative timestamp to null; it invents no projection clock. The earlier immutable release remains unchanged and unregistered.

Run `npm run childcare-state-availability:build` to reproduce the local derived release and `npm run childcare-state-availability:verify -- --manifest <manifest.json>` to independently replay it from the registered retained ZIP evidence.
