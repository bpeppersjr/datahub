# Proposed additive CMS directory production — October 2, 2026

Fresh governed planning completed after implementation commit `a13abe65b2829860a6c58e7999a387df79bb3808`. That commit replaces the long-scroll Collector dashboard with focused Coverage, Industries, ZIP Economy, Jobs, Collection, Evidence, and Connectors workspaces; adds a state dataset-availability choropleth and selected-state summary; preserves the existing operational panels; explicitly withholds unsupported ZIP, industry-segment, and demographic GDP allocations; and updates Next.js to 16.3.8 to resolve the audited `next/og` advisory.

- Run ID: `production-cms-directories-20261002-71`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-71.json`
- Exact confirmation SHA-256: `a892e303ba643c45a450ccb3f2885e2fd792e9e3ed062114213d060bb06105cf`
- Plan file SHA-256: `92e86686bec8f96d04f950ff01147bba512aaad7f4fd148b06cf68c872ae7595`
- Planning implementation commit: `a13abe65b2829860a6c58e7999a387df79bb3808`
- Created: `2026-10-02T07:13:25.649Z`

The retained-only plan reconstructs the governed 25-source production roster, four geographic/baseline inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. These rows remain local-review-only publisher directory evidence, not verified unique businesses, physical sites, current operations, or nationwide completeness.

If separately approved, eight sequential build/verify stages would publish registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The plan contains zero acquisition stages and zero network stages; no USPS dependency is selected.

Read-only exact-plan preflight returned `READY`. All pins and retained inputs were reconstructed and verified, `writes_performed` was `false`, the `national-12g` memory profile was retained, available disk was 234,246,914,048 bytes, and the required rebuild floor was 13,309,329,011 bytes.

The repository-wide gate passed 2,824 tests: 2,755 passed, 69 intentionally skipped, and zero failed, cancelled, or todo. Lint passed with zero errors and four unrelated pre-existing warnings. Web and desktop builds passed, the desktop control-plane smoke passed, the focused workspace tests passed 19/19, TypeScript passed, and `npm audit --omit=dev` reported zero vulnerabilities after the Next.js patch.

Runtime verification used `stop-collector.bat`, confirmed port 4300 clear, launched through `launch-datahub.bat`, and confirmed exactly one loopback listener with a healthy `/api/health` response. Visual checks confirmed the state choropleth, selected-state summary, national/state industry shares, and exact ZIP evidence. The normal secured Collector was then restored and left running.

This plan changes no retained source pointer, source bytes, governed coverage release, dataset denominator, state/DC availability value, industry evidence count, business entity, ZIP5/ZIP+4 handling, or export policy. State colors represent versioned dataset availability (`available / measured`) and keep unmeasured members separate; they are not all-business completeness. BEA state/county GDP, Census ZIP Business Patterns, and population context remain distinct. No ZIP GDP, industry GDP, or GDP-by-race/ancestry/sex/age value is fabricated.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 70 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production run directory, production pointer change, or governed evidence rebuild occurred while preparing Plan 71.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-71 --expected-plan-sha256 a892e303ba643c45a450ccb3f2885e2fd792e9e3ed062114213d060bb06105cf
```
