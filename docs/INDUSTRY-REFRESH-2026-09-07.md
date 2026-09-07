# Industry refresh evidence — September 7, 2026

These independent retail-consumer source refreshes use existing governed connectors and preserve production pointers while integration continues. Buckets identify publisher jurisdiction; they do not reclassify every source record as a grocery store or allocate other-state premises to the publisher state.

| Source bucket | Verified release | Evidence |
| --- | --- | --- |
| New York retail-food licenses | `ny-retail-food-stores-20260907-134303353Z-c3167a89` | 24,281 source licenses; 24,230 provisional sites; 22,999 usable platform geocodes; 1,500 source ZIPs; zero quarantined rows; seven verified artifacts |
| California ABC licenses | `ca-abc-active-licenses-20260907-134420041Z-1d86412e` | 105,672 selected license rows; 84,497 provisional sites, including 82,495 CA premises and 2,002 other-state premises; 237 quarantined rows; 22 verified artifacts |
| Washington contractor licenses | `wa-lni-active-contractor-licenses-20260907-135045275Z-4c8b3283` | 75,816 active license rows; 72,819 organizations; 74,030 eligible U.S. mailing addresses; zero quarantined rows; 21 verified artifacts; no inferred physical sites |

Local pointers:

- `data/industry-refresh/retail-consumer/NY/ny-retail-food-stores/current.json`
- `data/industry-refresh/retail-consumer/CA/ca-abc-active-license-sites/current.json`
- `data/industry-segments/runs/construction-wa-20260907-standalone/state-wa-contractors-WA/current.json`

New York retains source release `ny-retail-food-stores-2025-09-30-9dfbb0199594dab8`; a successful retrieval does not make the annual source snapshot newer. California source modification was `2026-09-07T10:50:28Z`. Both releases preserve their source-specific license status and limitations rather than asserting independently observed current operation.

Independent verification:

```text
node scripts/verify-ny-retail-food-stores.mjs data/industry-refresh/retail-consumer/NY/ny-retail-food-stores/current.json
node scripts/verify-ca-abc-active-license-sites.mjs data/industry-refresh/retail-consumer/CA/ca-abc-active-license-sites/current.json
node scripts/verify-wa-lni-active-contractor-licenses.mjs data/industry-segments/runs/construction-wa-20260907-standalone/state-wa-contractors-WA/current.json
```

The source-native and normalized artifacts remain in their existing policy layers. These new releases have not yet been reconciled into the production registry, resolution, or coverage release. National completeness remains unproven.

Washington exercised the standalone orchestrator end to end using `npm run industry:run -- --industry construction --state WA --run-id construction-wa-20260907-standalone`. Its durable receipt records success and the completed log checksum. This is a state-publisher license source: neither mailing addresses nor license activity establish a physical operating location.
