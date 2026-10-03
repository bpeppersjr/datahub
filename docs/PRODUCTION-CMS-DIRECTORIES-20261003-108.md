# Proposed additive CMS directory production — October 3, 2026

Plan 108 is the current clean-repository successor after adding the governed national exact-ZIP cross-industry evidence matrix and the separately governed ZCTA GDP model approval-readiness packet to Co*Tive Collector.

- Run ID: `production-cms-directories-20261003-108`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-108.json`
- Exact confirmation SHA-256: `6e051349265210e4175961cd759b64d916320bd6f3f0e8fea99d06ebfecda7db`
- Plan file SHA-256: `4231e6871136cd87d5976e7248d0e957c27876f211f15a9fa4d54c0d54fc05cd`
- Planning repository commit: `f9fcd9b`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The exact-ZIP matrix composes 48,194 retained ZIP5 evidence keys across nine national source layers into 433,746 source-specific cells: 210,174 positive, 166,120 measured zero within the corresponding source projection, and 57,452 outside the source denominator. The layers remain nonadditive. ZIP+4 remains separate, USPS validity remains unknown, and no all-business or current-operation completeness is asserted.

The GDP approval packet independently replays 65,631 allocation-evaluation relationships and 3,091 county diagnostics. It reports 30,576 of 33,791 Census ZCTAs technically feasible under all proposed research methods and withholds 3,215. The decision remains `HOLD`; model approval, output authorization, numeric GDP, industry GDP, demographic GDP, and official USPS ZIP GDP are all absent.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 186,915,033,088 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration suites passed 46/46. TypeScript, ESLint, production and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. The relaunched collector has exactly one port 4300 listener; unauthenticated health access returned the expected HTTP 401 authentication boundary.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 107 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 108.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-108 --expected-plan-sha256 6e051349265210e4175961cd759b64d916320bd6f3f0e8fea99d06ebfecda7db
```
