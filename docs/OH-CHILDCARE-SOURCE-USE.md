# Ohio conditional internal-use decision

The [September 8 source-use decision](states/OH-CHILDCARE-USE-DECISION-2026-09-08.json) permits preparing **conditional internal informational collection** under the user's explicit business-collection and app-owned-download instructions. It is an integrator source-use assessment—not a user signature, legal opinion, publisher authentication, agreement acceptance or permission to redistribute records publicly.

The [official Ohio child care search](https://childcaresearch.ohio.gov/) links the map and describes both rated and unrated programs. The complete dataset item notice was re-read at `2026-09-08T06:52:22.029Z`: its full `licenseInfo` and description matched the earlier retained strings. It describes public informational use at user risk with accuracy, warranty and liability disclaimers. Neither the integrator nor the independent peer found an explicit collection prohibition, click-through requirement or indemnification obligation in those strings. This does not establish the contents of unavailable linked pages.

Both XML endpoints still returned the previously recorded error pages (404 and 400). Direct checks of the linked program and privacy pages returned 404. Exact timestamps, body sizes and hashes are recorded in the decision; raw HTTP bodies are not claimed archived. The fixture `runner/fixtures/oh-childcare-publisher-notices.json` retains the complete publicly returned item notice strings solely for portable positive/negative conformance tests, not facility data. A matching fixture is not proof of publisher contact.

## What changed—and what did not

The new `oh-childcare-internal-acquisition@1.0.0` policy narrows use to the ten selected source attributes for publisher-Open Child Care Centers and returned EPSG:4326 points, with internal source retention and local-review normalization. It excludes other care types/statuses, contact/mailing fields, the separate CSV access-code workflow, agreement acceptance and public redistribution. Source-use authorization is conditional; connector/app readiness remains false.

The original `oh-childcare-local-review@1.0.0` development profile is unchanged. Earlier offline records and release verifiers remain pinned to it; this decision does not rewrite them or turn an offline release into an acquired production release. No production pointer, schedule or native downloader was enabled.

## Executable prerequisite binding

`bindOhChildcareSourceUse(preflight, availability, { checkedAt })` fully replays the preflight and checks:

- Exact versioned policy and decision fingerprints.
- Both complete item notice strings against reviewed UTF-8 hashes.
- The exact four linked/XML availability URLs, statuses, byte sizes and body hashes, in recorded order.
- Canonical timestamps no later than the explicit check time and no more than 15 minutes old, including the start of preflight.

Changed notices, changed error pages or newly available content require review. Missing resources do not become presumed unrestricted rights or permanent prohibition. Stale, future, incomplete or caller-augmented approval inputs fail closed.

The returned binding includes policy, decision, preflight and availability hashes and their limitations. It records conditional source use but sets dispatch authorization, app enrollment, agreement acceptance, legal approval, public export and source-authenticity verification false. It is supplied-evidence validation, **not a security token or proof that caller-supplied times reflect live requests**. The eventual app lifecycle must obtain fresh evidence itself before rows and persist the binding with its operation receipt.

## Current evidence

The refreshed ten-observation preflight ran from `2026-09-08T06:54:35.584Z` through `2026-09-08T06:54:46.037Z` and retained:

```text
data/business-sources/oh-dcy-publisher-open-childcare-centers/preflights/318dcd59-9ab1-441d-8f3e-de509ab92cb0.json
Raw file SHA-256: dcca45679d41ac8641e7fa693bc3af9b58d2c100ccf83ed1ab1e141be19e2cc1
Bytes: 36631
```

It reports 4,237 Open, 102 Inactive and five Enforcement center rows, totaling 4,344. Zero facility rows or IDs were acquired. Source status/count evidence is not verified operation or statewide business completeness. The [retained binding result](states/OH-CHILDCARE-USE-BINDING-2026-09-08.json) passed against that actual prerequisite and the recorded availability observations. Its preflight hash is the canonical parsed JSON hash, distinct from the raw file hash above. This historical binding will expire for dispatch purposes; the app must refresh prerequisites rather than reuse its old check timestamp.

Four new tests cover matching complete notices, synthetic/changed notice rejection, availability drift, freshness and false approval overrides. Independent read-only review found no actionable defect.

The full repository check passed all 898 tests, source checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. These checks do not prove live facility acquisition or national completeness.

## Next delivery

Implement the app-owned Ohio acquisition lifecycle: fresh bounded notice checks, before-row invocation of this binding, durable operation/source-use evidence, a separately versioned acquired-release contract, cancellation and failure recovery boundaries, and collection enrollment. Hand an accepted operation to Co*Tive and release the agent; do not occupy Codex with routine downloading or repull verified releases for promotion. This source-use increment alone does not authorize dispatch from the still-disabled native entry.

Rollback is additive code/configuration rollback. Preserve the original development policy, source research, preflight receipts and all prior releases.
