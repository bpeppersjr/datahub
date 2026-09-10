# New Hampshire: search-only CSV prerequisite

## Outcome

**The bounded search export was received but rejected for malformed CSV syntax.** This is an observed delivery-format issue, not proof that the source prohibits collection or that New Hampshire has no businesses. No NH candidate dataset was published or added to national coverage.

The fixed standalone prerequisite is `node scripts/probe-nh-childcare-search-export.mjs --run`. It opens the ordinary [DHHS public search](https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch), chooses Licensed Group Child Care Program and ZIP5 `03755`, submits one search, and permits only the visible **Download Your Search Results** action. It never calls undocumented remoting methods directly, clicks the statewide provider export, follows provider details, or changes a production pointer. There is no retry loop, schedule, managed-operation enrollment, or unattended acquisition handoff yet. `--help` is read-only; other caller-supplied URL, ZIP and output arguments are rejected.

## Verified native evidence

Final diagnostic run: `b34bb2b8-f554-4006-9472-4d49ef91b933`, from `2026-09-10T15:41:21.633Z` to `2026-09-10T15:41:23.942Z`.

- Manifest: `data/business-sources/nh-childcare/search-export-probes/b34bb2b8-f554-4006-9472-4d49ef91b933/manifest.json`.
- SHA-256: `c4adf2149f8588491eda03260e2c375fb7375ed1e686e275d44a9219e4768425`.
- Selected program type and ZIP matched the fixed query; the completed page reported six results and displayed six result entries. Exactly one search-export control was visible.
- One download event; filename matched `SearchResults.csv`; received document length 1,736 bytes.
- Failure phase: `validate-search-export`; fixed rejection code: `NH_EXPORT_csv-syntax`.
- Browser cleanup verified; only the aggregate manifest remains. The source rows cannot be replayed from this receipt. It proves a native bounded validation observation, not independently attested remote authenticity.

Five manually initiated development runs occurred, with repairs between runs; none automatically retried. Earlier immutable receipts are preserved: `827c7216-3488-4e0b-bf7c-94bac7d1a2fc` stopped in query selection; `055bb64d-e9a9-4183-ac6f-80c05a0f575b` stopped in search completion; `c43f3714-5f03-4123-b645-727bbebde48f` and `0e26340f-2aa8-411a-9612-51bac6846fa5` reached one download each but lacked the final fine-grained rejection code. These are different development iterations, not five confirmations of an identical finalized implementation. All five report verified browser cleanup. No further native retry is needed to establish the observed syntax failure.

Current public-page code wraps exported values in double quotes without visibly escaping embedded double quotes. That is a plausible cause, but the discarded CSV was not retained or inspected for individual offending cells. Do not claim the exact offending record or characterize the failure as proven embedded-quote corruption. The earlier static timing concern affected the separate provider-wide export, which was not used here.

## Boundaries and limits

The browser profile, downloads, temporary files and artifacts live in one UUID-scoped directory inside `datahub`. Raw source data can exist transiently in downloads and browser caches. After closing the owned browser, cleanup checks the scratch-directory identity and containment before removing it. Cleanup uncertainty makes the run fail and marks residual row persistence unknown. There are no screenshots, HARs, traces, saved HTML, raw browser logs or retained contact/row artifacts.

The request allowlist covers the portal and dependencies observed in its HTML. Redirects are rejected before following; URL credentials and non-default ports are rejected. The browser performs the portal's ordinary embedded-resource requests, which can include map, translation and CAPTCHA resources. No map key is copied or independently repurposed, and no CAPTCHA is solved or bypassed.

The limits are 90 seconds, 120 intercepted requests, 20 accepted rows and 256 KiB of accepted CSV. CSV size is checked while consuming the completed download stream: it is **not** a hard transfer or temporary-disk cap. Browser/API response buffers are also not a hard byte-limited transport. These limitations prohibit treating this prerequisite as a production collector merely because one bounded file fits. No new runtime or dependency was installed.

Strict analysis requires the exact ordered public export headers, valid UTF-8, proper CSV quoting, consistent columns, matching displayed/exported row counts, and bounded fields. It emits aggregate ZIP format and query-match counts, redacted/missing counts, duplicate source-identifier counts and unresolved date-shape counts. It never guesses shipping-address role, substitutes billing for redacted shipping data, turns enrollment into active status, or assigns publisher geography to a business. ZIP5 and ZIP4 are separately recognized without numeric conversion; no joined ZIP field is emitted as a business dataset.

## Next delivery action

Do not relax CSV quoting or guess record boundaries to force this export into production. A successor must obtain an unambiguous authorized delivery format (or validate the ordinary visible search-result fields as a separate source contract), retain minimal business evidence with provenance, and independently verify parsing before app enrollment. Source-wide limits, identifier lifecycle, address roles, current-status meaning, retention and redistribution scope remain unestablished. Unknown currentness can be retained honestly; it must not be replaced with `active=true`.

The parallel follow-up selected ordinary rendered result entries as the next concrete adapter: visible program name, visible address and same-origin observed detail-link identifier only. The September 9 observation already established these entries independently of CSV. The [portal explanation](https://www.nh-connections.org/families/about-nh-child-care-search-portal/) describes a public information function combining licensing and referral information; this is not a blanket bulk-use or redistribution license. An adapter should first pass offline count/scope/redaction/quoting/address tests, then receive one separately reviewed native acceptance run. It must not read backing objects, hidden remoting responses, contacts or map coordinates, and must leave absent geocodes/current status unknown. This review submitted no search and acquired no additional records. No official static statewide roster was located in that bounded documentation search; this is a documentation gap, not a claim that none exists or collection is prohibited.

Rollback removes these standalone prerequisite/profile/workflow modules and tests; preserve native receipts. This change does not alter current datasets, the source catalog, a scheduler, the UI, or any previously approved production plan. The existing local Sites app architecture and hosting metadata are unchanged.

## Release verification

Eight focused tests passed, covering strict CSV/encoding/header/row limits, unknown ZIP/date/identity semantics, fixed CLI scope, stale/ambiguous UI state, no retry, redirects, credentials/ports/host escapes, request ceilings and cancellation. The independent review's browser redirect, download-wait, initial-result and cleanup findings were addressed. Native evidence above demonstrates the observed rejection and scratch cleanup; it does not exercise a successful CSV acceptance or managed application handoff.

Full `npm run check` passed: 1,730 tests total, 1,719 passed, 11 skipped, zero failures, followed by lint, application builds and desktop control-plane smoke. Installed PDF, Iowa, retained-cohort and Overture-runtime prerequisites were enabled. Log: `data/tmp/nh-search-export-prerequisite-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. The four current production pointer and manifest hashes still match the approved September 10 production receipt. The development server was cooperatively stopped for lifecycle validation; no production process or source dataset was removed.
