# National business lifecycle ZIP evidence

This pointer-free local-review derivative projects the selected business-entity lifecycle decisions into the governed 48,194-key ZIP5 cohort. It provides source-relative lifecycle membership counts for national, state, and exact-ZIP follow-up without changing the national registry, exact-ZIP matrix, goal federation, or any runtime pointer.

The registered release is `national-business-lifecycle-zip-evidence-695c384cc80740a9b3c4c847a1301ec21f0f66cef789951c71c6957bf54e1f2f`; its manifest SHA-256 is `f1d4959f62e0837441dd1bdd1af7271c8a9093d5fc172d9d046e997cfed3d33a`. One hundred gzip partitions contain exactly 48,194 ordered ZIP rows. A separate outside-cohort artifact is empty but retained so later drift cannot disappear silently. The release has 42,267 ZIP keys with at least one lifecycle profile and 5,927 keys with zero profiles.

## Conservation and lineage

The builder replays all 100 checksum-bound partitions in selected lifecycle release `business-entity-lifecycle-eligibility-a4b84f5cace847e888832a2efefd09efadb773463864b11bcfad89be3936087f`. All 8,011,213 profile memberships reconcile exactly:

- 5,240,481 `source-defined-current` memberships;
- 2,134,833 `non-active-reporting` memberships;
- 633,232 `unknown` memberships;
- 2,667 `contradictory` memberships.

Review status separately conserves 7,987,605 within-window memberships and 23,608 unmeasured memberships, with zero stale or unmapped memberships at the bound assessment. The 15 source totals exactly match the lifecycle manifest. All decisions fall inside the governed ZIP cohort; no lifecycle membership is outside it.

The release also pins the ZIP denominator-gap cohort and exact-ZIP matrix v3.2 registrations and manifests. It preserves the cohort classifications: 33,791 same-code Census ZCTA keys, 14,361 source-contributed keys outside a same-code ZCTA, 41 denominator-only keys outside a same-code ZCTA, and the explicit `00000` placeholder. These classes are evidence placement, not USPS validity or deliverability.

## Meaning and limits

The record unit is a registry location-profile lifecycle membership. Counts are not unique businesses and are not additive across sources. A publisher's current/listed/active membership is not independent verification that a business is presently operating. The release therefore keeps unique-business count, active-business count, current-operating-business count, all-business completeness, and an authoritative current USPS denominator null. Every input lifecycle decision remains `current_operation_verified:false` and `active_business_eligible:false`.

This derivative performs no network request, source acquisition, identity resolution, production enrollment, pointer write, ZIP+4 join, or application integration. ZIP+4 remains a separate field in its governed source datasets. Missing population, entity coordinates, and universal business denominators do not block this source-relative evidence, but none may be inferred from it.

## Reproduction

Run `npm run business-lifecycle-zip:build` to reproduce the immutable content-addressed release from retained inputs. Run `npm run business-lifecycle-zip:verify` to independently replay all lifecycle and cohort artifacts and compare all 48,194 derived rows, source totals, lifecycle totals, review totals, artifact hashes, and closed claims against the registered release.

Application and national-federation integration are intentionally deferred to a separately reviewed successor.
