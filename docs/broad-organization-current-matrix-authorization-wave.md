# Current-matrix broad-organization authorization wave

This separate immutable `broad-organization-current-matrix-authorization-wave@1.0.0` release is derived from the independently verified current matrix-gap projection. Wave 1 selects the ten smallest historical backlog priorities that remain among the 40 current gaps: IL, MS, AR, KY, HI, KS, NV, UT, WA, and OK. Wave 2 selects the next ten: AL, AZ, CA, GA, ID, IN, LA, MA, MD, and ME. Wave 3 selects MI, MN, MO, MT, NC, ND, NH, NJ, NM, and OH. Wave 4 selects the final ten: RI, SC, SD, TN, VA, VT, WI, WV, WY, and NE. Each wave after the first is cryptographically bound to the immediately prior published and verified wave; verification follows the chain back to wave one. AK, DC, and TX are not selected because their broad layers are currently admitted. Conservation is wave 2: 10 prior + 10 selected + 20 remaining; wave 3: 20 + 10 + 10; wave 4: 30 + 10 + 0. No historical backlog, authorization program, or first-wave packet is rewritten.

Every state and gate item is explicitly `approval-only` and `HOLD`. Full assessment snapshots, gate provenance, and required exclusions are preserved. The packet grants no acquisition authority and performs no source, network, pointer, or production action.

Build and verify a release locally:

```powershell
npm run broad-org-current-wave:build
npm run broad-org-current-wave:build -- --wave 2
npm run broad-org-current-wave:build -- --wave 3
npm run broad-org-current-wave:build -- --wave 4
npm run broad-org-current-wave:verify -- --manifest data/broad-organization-current-matrix-authorization-wave/releases/<release-id>/manifest.json
```
