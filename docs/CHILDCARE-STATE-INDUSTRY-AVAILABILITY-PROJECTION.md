# Childcare state-industry evidence availability

This pointer-free local projection uses only the registered retained childcare ZIP evidence release. It represents PA, CT, MD, VT, CO, UT, and IA as measured retained candidate cohorts. The other 44 states/D.C. are explicitly unmeasured; they are not zeroes.

The count unit is a retained source-candidate row. The projection conserves 12,206 rows as 12,205 ZIP-present, zero missing-ZIP, and one invalid-ZIP candidate. These counts are evidence availability, not a state or national reporting denominator, businesses, physical sites, current operations, USPS validity, or completeness.

The build performs no network request, acquisition, current-pointer write, or production enrollment. Releases are content-addressed immutable directories under `data/childcare-state-industry-availability-projection/releases`; registration pins one exact manifest and retains a null runtime pointer.

The registered v1.1 successor is `childcare-state-industry-availability-projection-ff8290992059647fbb97bef0129f5e010e45fef282746e23f15c8bbd0641413a` (manifest SHA-256 `bf27e1d6a98558631b14ed08b7f008311933641bcbba9f8ba87bc8da79d6784b`). It binds retained childcare ZIP evidence v1.2 and conserves 12,210 source-candidate rows: 12,208 carry ZIP5, one Vermont row has no source ZIP, and one Maryland row retains its invalid-range classification. The projection preserves the bound source release's `created_at` only as source metadata and explicitly sets the derivative timestamp to null; it invents no projection clock. Earlier immutable releases remain unchanged and unregistered.

Run `npm run childcare-state-availability:build` to reproduce the local derived release and `npm run childcare-state-availability:verify -- --manifest <manifest.json>` to independently replay it from the registered retained ZIP evidence.
