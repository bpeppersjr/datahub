# Nebraska PDF internal-use assessment — 2026-09-09

## Decision and scope

**The DHHS publication context supports ordinary access to one free roster for assessment, but this review does not establish an unqualified permission for Co*Tive's automated internal acquisition.** There is a concrete linked-policy scope question, not merely missing terms. An internal copy is not automatically a personal/non-commercial use. The integrator should record a scoped disposition of that question before enabling this source's unattended PDF fetch; do not invent a statewide prohibition or claim legal certainty.

This is a source-governance assessment, not legal advice. It covers one internally retained release for printed-edition/layout assessment only: no public export, provider publication, mailing list, marketing, or current-business promotion. No PDF body was requested in this pass. The earlier HEAD evidence is in [the current-edition note](NE-CURRENT-EDITION-2026-09-09.md); its September 2026 HTTP modification signal does not establish the printed edition.

## Positive publisher basis

- The [DHHS parent-information page](https://dhhs.ne.gov/Pages/Search-for-Child-Care-Providers.aspx) directly presents the free ZIP-organized childcare PDF as a public search option. It expressly includes family homes, centers and preschools. That is affirmative publication context for reading this document, not a hidden endpoint or inferred permission from reachability.
- [DHHS Licensee Information](https://dhhs.ne.gov/licensure/Pages/Licensee-Information.aspx) separates paid mailing-address files from the option labeled **“Download a roster”**. Its link leads to [Rosters of Facilities and Services](https://dhhs.ne.gov/licensure/Pages/Rosters-of-Facilities-and-Services.aspx), which lists childcare rosters and describes roughly mid-month updates. The distinct paid option does not show that every free roster requires purchase. No paid workflow was entered.
- The [DHHS General Disclaimer](https://dhhs.ne.gov/pages/disclaim.aspx), under General Disclaimer and Legal Advice, treats the site as a public resource, disclaims responsibility for errors/use, recommends source verification for research, and warns information can need updating. This supports careful assessment but supplies no broad redistribution license. Its separate IT-resource, unauthorized-access and health-information warnings must not be treated as permission to enter protected systems—or automatically as a ban on the public roster it advertises.

## Linked notice that must be preserved

The DHHS footer's [Security, Privacy & Accessibility Policy](https://dhhs.ne.gov/Pages/Policies.aspx) links `https://www.nebraska.gov/policies.html`. That URL returned an HTML refresh pointing to `/policies/`; the HTTPS [Nebraska.gov Policies page](https://www.nebraska.gov/policies/) was inspected. The relevant published headings are **Nebraska Use Policy / Use of Site Information** and **Site Conduct**.

That portal notice permits copying/downloading for personal, non-commercial use with proprietary notices intact; it restricts other reuse and derivative works. Site Conduct requires prior written permission for automated tools and even manual processes that monitor/copy its pages or content. It also restricts unauthorized marketing uses of contact information. These are actual observed restrictions, not an inference from an unspecified license. The portal's linking section distinguishes externally maintained sites and disclaims control over their content.

**Applicability remains unresolved:** the document is on `dhhs.ne.gov`, separately presented by DHHS as downloadable, whereas the notice identifies Nebraska.gov/the Company and speaks of its Site. The DHHS link makes the notice relevant; neither the shared state branding nor the link alone proves that every portal restriction governs the DHHS PDF. Conversely, the download invitation does not explicitly waive automation restrictions. Do not silently choose either interpretation.

The portal prose above was inspected in HTML after removing comments and scripts; Site Conduct and its automation language remained. No agreement button was clicked. No PDF-specific notice inside the file has been inspected, so additional document notices remain unknown.

## Proposed narrow internal handling

If the integrator resolves the linked-policy scope in favor of this one assessment, record that reasoning and exact reviewed notice URLs in a versioned source profile. If applicability cannot be resolved from evidence, obtain a user-directed policy decision or publisher clarification; this agent has not contacted anyone or asserted permission on their behalf. Do not use a manual-download workaround merely to evade a restriction assumed applicable.

The implementation should then:

1. Let Co*Tive acquire one bounded, exact-URL release under an immutable operation receipt; preserve body checksum, HTTP headers, acquisition time, attribution and all document notices. Keep original evidence under `datahub` outside Git/public artifacts. No high-rate refresh or automatic retry is justified by this assessment.
2. Keep the mixed home/center original internal. Output only edition/layout/validation evidence at this prerequisite stage. Do not emit owner names, home addresses, phones, or provider rows into logs, fixtures, public Git, flat-file exports or map layers. These are proposed Co*Tive minimization controls, not invented publisher-specific statutory requirements.
3. Use an isolated bounded decoder. Inspect newly encountered document notices before further normalization. Separate provisional centers from other types only after schema validation; do not infer current operation from a license listing or HTTP timestamp.
4. Reuse the retained verified release for subsequent authorized assessment. No publisher-specific deletion deadline, retention term, refresh quota, commercial data license or redistribution grant was established in the reviewed pages. Their absence is neither a deletion mandate nor an unlimited-use grant. Retain the evidence internally for assessment/provenance with access limited to the application/operator; reconsider handling if actual document terms conflict.

## Verification and handoff

Official HTML pages only were reviewed on 2026-09-09. One web fetch of the DHHS policy landing page timed out; a direct request subsequently returned HTTP 200. No provider body, PDF, CAPTCHA, credentialed route, purchase, external message or app operation was used. This note does not change runtime/configuration, source readiness, production pins or business counts. Root owns policy disposition, implementation tests and release; rollback is removal of this documentation-only note.
