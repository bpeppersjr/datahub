# Idaho statutory and source-route reference

The standalone reference dated November 13, 2026 remains **HOLD**. It supplements the October assessment without changing that assessment or admitting Idaho to the readiness wave. No source records or files were retained, and no connector, source query, acquisition, contact, account, payment, terms acceptance or production action is authorized.

The coordinating agent observed HTTP 200 through an ordinary fetch of [Idaho Code § 74-120](https://legislature.idaho.gov/statutesrules/idstat/Title74/T74CH1/SECT74-120/), resolving the earlier retrieval failure for this observation. Subsection (6) exempts the specified Secretary of State corporate information list from that section's restrictions. This exception does not establish that a current product exists or grant affirmative reuse, automation, retention or redistribution rights. Its description includes agents, officers and directors, requiring privacy review.

The current [business resources](https://sos.idaho.gov/business-resources/) and [FAQ](https://sos.idaho.gov/business-resources/business-faq/) describe search, filings and registered agents, without establishing a recurring business-master contract. Registration is not proof of operating activity; agent addresses are service addresses, not proof of operating sites. The [SOSBiz lists shell](https://sosbiz.idaho.gov/lists) was inconclusive, and no source query was made. The former [public records route](https://sos.idaho.gov/public-records-requests/) redirected to [JustFOIA](https://sosidaho.justfoia.com/publicportal/home/newrequest), which does not establish a bulk delivery route or authorize a request.

The historical [UCC implementation guide](https://sos.idaho.gov/docs/pdf/UCCXMLImpGuide.pdf) and [quick start](https://sos.idaho.gov/docs/pdf/UCCXMLQuickStart.pdf) returned 404 in the coordinating agent's current observations. Historical indexed descriptions concern filing submission, not business retrieval. A [recently appointed registered-agent report link](https://sosbiz.idaho.gov/api/report/FromActiveReport/0/RARecentlyAppointed/0) was observed, but its PDF body was not requested and that cohort is excluded. These observations establish no business master, current schema or rights.

Product existence, scope, person-free schema, identifiers, status and address semantics, delivery, change controls, pricing and rights remain unresolved. Separate authorization and governed approval are required before any source query or acquisition. The local verifier pins the exact evidence bytes and parsed content; it does not independently fetch the cited resources.

```powershell
node scripts/verify-id-statutory-source-route-reference.mjs
node --test runner/id-statutory-source-route-reference.test.mjs
npx eslint runner/id-statutory-source-route-reference.mjs runner/id-statutory-source-route-reference.test.mjs scripts/verify-id-statutory-source-route-reference.mjs
```

Tests pin the October assessment's SHA-256 `a6ebcefdb6c7d37d59e326a149cc714cd878bd84bd698f7c1340497b08901077` and require Idaho to remain absent from the readiness wave. Revert these five standalone files together to roll back; future evidence changes require a new versioned reference and review.
