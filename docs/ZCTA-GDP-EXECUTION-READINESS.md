# ZCTA GDP execution readiness

This immutable pointer-free release turns the approved research evidence into a per-ZCTA execution plan without calculating or publishing GDP. It binds the exact HOLD approval packet, proposed model specification, allocation evaluation, evaluation artifacts, and unchanged BEA policy.

All 33,791 governed 2020 Census ZCTAs are conserved. Exactly 30,576 are `feasible-on-approval` under the proposed complete-case rules and 3,215 are `withheld`. Each row records material relationship identities, county GEOIDs, input/weight availability, conservation status, vintages, and deterministic withholding reasons. No county GDP value, ZCTA estimate, component amount, industry amount, demographic amount, or uncertainty amount is present.

Industry allocation remains unavailable because there is no governed county-industry GDP input, governed NAICS-to-BEA concordance, or permitted nonemployer ZIP allocation. Feasibility is not approval. Every row remains `decision_status=hold`; USPS ZIP status, observed ZCTA GDP, model approval, output authority, and production enrollment remain false.

Selected release: `zcta-gdp-execution-readiness-757e0d4746c22bdb5153a35bf25a62dc10b7eb80cc545fe39af3c428bed2471c`; manifest SHA-256 `5ed3bbe7e2fa507fb20df55b0d1ec6dc147dc6fb68de80885194e9e6c3a66de8`.

```powershell
npm run zcta-gdp-execution-readiness:build
npm run zcta-gdp-execution-readiness:verify -- --manifest <immutable-manifest>
```
