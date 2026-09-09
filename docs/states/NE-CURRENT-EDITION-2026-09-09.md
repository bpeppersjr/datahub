# Nebraska current-edition investigation — 2026-09-09

## Decision

**A newer official publication signal is available on the free DHHS PDF roster. Its actual roster edition and provider contents remain unverified.** Prefer a bounded, app-owned PDF edition/schema preflight next, instead of repeating the already-observed October 15, 2025 GIS aggregate or claiming that cohort is current. No Nebraska provider dataset was acquired, enrolled, or promoted by this investigation.

The prior [source follow-up](NE-SOURCE-FOLLOWUP-2026-09-09.md) remains the evidence for the 699 center and 51 provisional-center rows dated October 15, 2025. That aggregate was **not repeated**. The cause of the GIS refresh lag remains unresolved; the examined documentation did not establish a publisher outage notice or replacement-current-service announcement.

## New direct evidence

The [DHHS parent-information page](https://dhhs.ne.gov/Pages/Search-for-Child-Care-Providers.aspx) explicitly links `/licensure/Documents/ChildCareRoster.pdf`. A bounded HTML GET returned HTTP 200 and 239,592 bytes and confirmed that exact link. The page describes a statewide, ZIP-organized PDF covering centers, preschools and family homes. This is a publisher-supported free delivery route, not the purchased-list workflow.

One **HEAD-only** request to [the official PDF](https://dhhs.ne.gov/licensure/Documents/ChildCareRoster.pdf), observed at **2026-09-09T05:13:30.697Z**, returned:

| HTTP metadata | Observed value |
| --- | --- |
| Status | 200 |
| Content-Type | `application/pdf` |
| Content-Length | `1264722` bytes |
| Last-Modified | `Tue, 08 Sep 2026 13:48:58 GMT` |
| ETag | `"{4B3037CB-F936-4979-B657-065EB4E86D17},89"` |
| Accept-Ranges | `bytes` |

This request rejected redirects and used a 15-second timeout. **No PDF body or provider rows were downloaded.** Last-Modified is an HTTP publication/version signal, not the internal roster date, an accuracy guarantee, or proof that all providers are currently operating. The ETag is opaque: its suffix must not be interpreted as a count of public releases. A later app acquisition must record its own response metadata and body hash rather than expecting this mutable URL to retain these values.

Search indexing exposed introductory PDF text saying the roster is updated weekly. That is a discovery clue, not an inspected current PDF edition. Separately, [official ECIDS documentation](https://ecids.nebraska.gov/ECIDS-Data/) describes frequent DHHS roster updates and periodic dashboard integration. Neither statement explains the GIS lag or establishes the dashboard's current record date. Do not replace publisher dates with a search crawl date.

## Other examined leads

- The [state document archive](https://govdocs.nebraska.gov/epubs/H8071/D001.html) lists historical roster editions through 2022 in the observed index; it does not resolve September 2026 currentness.
- Search discovered another state-hosted [MapServer metadata route](https://gis.ne.gov/agency3/rest/services/DHHS_Licensed_Child_Care/MapServer?f=pjson). A single metadata GET at 2026-09-09T05:14:00.580Z returned HTTP 200, 3,104 bytes, service item ID `7f6894c1fa4f40b0bb3827b09d09be0a`, and one point layer. Both service description fields were empty. This is a distinct route, **not a validated replacement or newer edition**. No layer query, feature count, provider records, or map rendering was requested. The response was read in memory with redirects rejected, a 15-second timeout, and a 1 MB cap.
- The license-search route still has the documented reCAPTCHA boundary. No search submission, CAPTCHA interaction, contact, payment, agreement, login, or proxy workaround occurred.

## Next implementable action

Build a narrow NE PDF preflight under Co*Tive's managed acquisition contracts, with source policy, exact URL allowlist, resource limits, cancellation, immutable run receipt and isolated PDF-decoder prerequisite. Before any body acquisition, review the mixed home/center content and internal retention policy. Do not assume the existing GIS public-use notice automatically grants PDF redistribution rights.

The app should acquire one bounded PDF release, preserve the original and HTTP/body provenance, extract its printed edition date and schema, and return a prerequisite result. It must not promote a current-business cohort solely from HTTP Last-Modified. Test center/provisional-center selection and exclusions without publishing home-provider or owner contact information. If no reliable edition is printed, preserve that unknown explicitly. Keep ZIP5 and ZIP4 separate; absent geocodes remain unknown, never invented or borrowed from stale GIS rows without an independently reviewed reconciliation.

Only after that source contract and parser are verified should an application operation ID and persisted receipt hand off routine acquisition. No new operation was dispatched here. This documentation-only investigation changes the next source-validation route, not active-business counts, nationwide completeness, production pins, or export eligibility. Root integrator owns review and release checks; rollback is removal of this note.
