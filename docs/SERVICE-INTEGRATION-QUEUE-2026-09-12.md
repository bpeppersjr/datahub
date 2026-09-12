# Reviewed service integration queue

These independent commits are not yet merged into main or available in the app. Do not merge them during the current File Builder full check. Root owns integration; source agents continue in isolated checkouts under `data/worktrees`.

| Service | Isolated commit | Evidence | Next step |
| --- | --- | --- | --- |
| MN credential heatmap aggregate | `af0f740` | Eight focused tests and retained native proof conserve 11,456 rows across state and postal groups | Finish/review the separate view adapter, then integrate the credential-specific map mode |
| MN credential map view adapter | `de111f7` | Twelve focused tests; native verification of 56 geography features, 51 displayed states/DC, fixed totals and shared snapshot; one outstanding loader pair maximum | Integrate credential-specific endpoint/UI after current app release |
| Oklahoma batch-status projection | `b8b7d0d` | Six focused tests; existing pinned implementation files untouched | Include standalone inspector in next service release; current historical plan replay remains unverified because an implementation pin changed |
| Census NES industry alignment | `ff08860` | Ten focused tests; 2023 retail NAICS 44-45 national/state counts reconcile at 2,081,566 | Integrate the service independently; UI selection/catalog is still needed before claiming an app feature |
| CMS hospital source contract | `962e8d2` | Official metadata/docs only; no hospital records downloaded | Implement/review bounded prerequisites before a separately reviewed national acquisition |
| CMS hospital offline prerequisites | `6fd3856` | Eight focused tests; metadata byte/schema and selected CSV field conformance, no transport authenticity claim | Review bounded app-owned acquisition lifecycle before native execution |

Heatmap and Oklahoma commits are in `data/worktrees/maine-provider-preflight`. NES and CMS commits are in `data/worktrees/retained-feed-integration`. Preserve those checkouts and ignored native proofs until integration is verified.

## Current main release boundary

File Builder's actual retained-only operation `8a46d759-8aa4-4c3a-98ef-fd63c28d079f` succeeded with one Wyoming-reported credential row. The UI download saved 1,593 bytes matching the managed artifact SHA-256 `df4d2d1c06a3b77d323262d1fd1d8dc9744fa6b2a711666cd296e21a0e5a4629`; restart visibility, mode switching and locked local-review policy passed. This validates that operation, not nationwide collection.

The first combined check ended with 1,887 passing tests, 60 skipped and one failure. Focused investigation confirmed that the legacy business-export API fixture omitted the new `business-flatfile-compatibility.mjs` dependency from its isolated child checkout (`ERR_MODULE_NOT_FOUND`). The fixture dependency repair and import smoke passed. Production imports and error redaction remain intact. Preserve the failed log `data/ui-verification/check-credential-file-builder-final.log` as diagnostic evidence.

The clean combined check passed: 1,948 tests, 1,888 passed, 60 skipped, zero failures; lint, builds and desktop control-plane smoke passed. TypeScript and dependency audit passed, with zero reported vulnerabilities. Evidence: `data/ui-verification/check-credential-file-builder-clean.log` and `credential-final-tsc-audit.log`. The tester ran `stop-collector.bat`, relaunched successfully and left Electron PID 6936 open; runner start was `2026-09-12T13:55:19.457Z`. Authenticated health, coverage, representation, schedules and credential-operation reads returned HTTP 200. Representation retained 51 states/DC and unknown all-business completeness; no schedules were enabled. These release checks do not include the isolated services above.

## Meaning of the new measures

Credential counts remain source credential rows, not unique businesses or verified operating sites. NES percentages describe an annual nonemployer industry universe, not collection completeness or employer establishments. Oklahoma terminal rejections are not accepted queries. CMS catalog row counts remain unverified until an actual acquisition is parsed and independently checked. None of these services changes production pointers or authorizes retrying held acquisitions.
