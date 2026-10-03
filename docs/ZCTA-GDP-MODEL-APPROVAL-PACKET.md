# ZCTA GDP model approval packet

The registered `zcta-gdp-model-approval-packet` is an immutable, pointer-free decision packet. It does not approve a model and does not publish GDP values.

## Bound evidence

The packet pins the exact retained manifests for the proposed model specification and allocation-method evaluation, plus the exact BEA source-policy hash. Verification replays those bindings and confirms that the BEA policy still prohibits allocating county GDP to ZIP codes or ZCTAs without a published source relationship.

## Audited research-scenario feasibility

The verifier independently replays the pinned 65,631 relationship rows and 3,091 county diagnostics. The resulting cohort contains 33,791 2020 Census ZCTAs. Under the proposed complete-case gate, 30,576 are technically feasible for all three research methods and 3,215 are withheld. Feasibility requires every material relationship to have direct county GDP, observed payroll and establishment proxy inputs, non-null finite method weights, and county weight conservation within `1e-10`. Missing, suppressed, or ineligible input is null and withheld, never zero. The packet cannot remain valid if those source rows, hashes, criteria, or recomputed totals drift.

These counts describe technical feasibility only. They are not approval, output authority, observed ZCTA GDP, USPS ZIP coverage, or business completeness.

## Current decision boundary

- `decision_status`: `hold`
- `model_approved`: `false`
- `output_authorized`: `false`
- `numeric_gdp_emitted`: `false`
- `production_enrollment`: `false`
- `current_pointer_written`: `false`

An explicit derived-model policy decision is still required. It must not weaken or reinterpret the BEA source policy. Industry and demographic GDP require separate governed inputs and model decisions; they are not authorized by this packet.

## Operator access

`readZctaGdpModelApprovalPacket()` performs a bounded read of the registered packet after independently verifying its manifest, artifact, upstream manifests, and policy hash. A future ZIP & GDP Overview panel can expose the decision state, the `30,576 / 33,791` technically feasible count, the `3,215` withheld count, and the required decisions without displaying any numeric GDP estimate.
