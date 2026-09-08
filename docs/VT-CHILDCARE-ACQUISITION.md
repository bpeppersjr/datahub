# Vermont childcare bounded acquisition

This stage builds on the [metadata prerequisite](VT-CHILDCARE-PREFLIGHT.md) and [observed selected POST contract](states/VT-CHILDCARE-SELECTED-DELIVERY-2026-09-08.md). It retains source-defined licensed-center candidates under a separate internal ODbL policy. It does not establish unique businesses, current operation, exact reporting dates, verified premises or address geocodes.

## Acquisition and retained evidence

The module separates fixed native transport from injected test transport. Native callers cannot supply a URL, query, transport, clock or source predicate. The source is fixed to Vermont `ctdw-tmfz`, licensed CBCCPP and CBCCPP - Non-Recurring rows. The selected projection contains 17 reviewed fields; it excludes family-home and afterschool rows, contacts, BFIS Person Record IDs and jittered coordinates.

Catalog and aggregate prerequisites use the existing bounded GET preflight. License rosters and selected record pages use fixed POST JSON, explicitly disabling system and synthetic columns and ordering by `file_name,license_id`. No method or endpoint fallback is permitted. The sequence is:

1. Complete and retain the initial six-request metadata/aggregate preflight.
2. Retain the ordered baseline license roster, including its required empty terminal page.
3. Retain selected pages against the exact baseline membership, including an empty terminal page.
4. Retain a matching final roster and empty terminal page.
5. Complete the six-request postflight and reconcile source evidence before publishing.

Each observation is journaled before the next request. Expected page sizes are derived from the preflight count, not inferred from a short response. Composite source keys must be unique across page boundaries; selected keys and final roster must match baseline order. Publisher order is not re-sorted using an assumed local collation. Selected program-type counts and non-null license-date counts must reconcile to preflight aggregates. Paired observations detect specified drift; they do not prove an atomic publisher snapshot.

Limits are 20,000 source rows, page size 500, at most 135 requests including both preflights and all terminal pages, serial pacing of at least one second, 30 seconds per request, 15 minutes overall, 8 MB per selected response, 2 MB per other response and 150 MB cumulative decoded bodies. A 503-row cohort requires 21 requests, not one download per ZIP. Publication requires at least 500 MB free disk. Available RAM does not override publisher pacing or limits.

## Storage and offline verification

Native default output is inside `data/business-sources/vt-childcare/acquired`. UUID-scoped jobs retain prerequisite, observation journals, acquisition evidence and a manifest published last. The writer uses exclusive ownership and checks file identities and hashes; existing releases and production pointers are not overwritten. Ordinary failures retain incomplete evidence for inspection. Cooperative cancellation removes only owned incomplete output; uncertain committed publication is preserved and reported for inspection. Partial journals are not a claim of automatic restart/resume support.

The verifier reads retained evidence without source requests:

```powershell
node scripts/verify-vt-childcare-acquired.mjs --manifest "C:\Master Data\datahub\data\business-sources\vt-childcare\acquired\jobs\<run-id>\manifest.json"
```

It replays source predicates, POST bodies, chronology, membership, aggregate conservation, configuration pins and artifact bindings. It rejects extra files, altered journals and mismatched execution modes. Hash agreement does not independently attest publisher authenticity or native execution. Sanitized preflight metadata bodies cannot be reconstructed from retained projected metadata.

## Policy and downstream boundaries

Preserve source attribution and ODbL notice and keep the source layer internal. Public redistribution and combined exports require separate compatibility assessment. Names and reported addresses may incidentally identify people; this does not authorize contact enrichment.

Unknown reporting period and unspecified address role remain visible quality gaps. Preserve raw source dates and reporting filename; do not infer state from publisher jurisdiction or exact coordinates from deliberately jittered source points. Subsequent normalization must keep ZIP5 and ZIP4 separate and conserve missing or invalid values rather than silently dropping source candidates.

Normalization, industry enrollment and the standalone app lifecycle are separate next steps. This module alone does not schedule refreshes or establish an accepted application operation. No native bulk acquisition is performed as part of its synthetic acceptance tests. Once the app lifecycle is verified, hand collection to Co*Tive with an operation ID and persisted receipt and release the agent from routine download supervision.

Rollback disables future use of this acquisition stage while preserving retained releases and journals. Downstream promotion must reuse verified retained data rather than downloading it again merely for promotion.

## Verification — September 8, 2026

Focused tests passed 20/20: seven acquisition groups and thirteen retained-release, registry and management-security checks. Synthetic 500/501-row cases verify full and partial pages plus all three terminal empties. Negative cases cover altered POST flags/pages, duplicate membership, program/date-count drift, unexpected fields, imported policy changes, denied requests without retry, malformed UTF-8, noncooperative POST cancellation, drained retention hooks, lock exclusion, rehashed journal substitution, invalid retention chronology and uncertain postcommit publication. No native bulk release was created; test-owned temporary artifacts were cleaned.

Full `npm run check` passed: 1,318 tests, 1,307 passed, 11 skipped, zero failures, plus lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/vt-childcare-acquisition-full-check.log`. Type checking passed and the production dependency audit found zero vulnerabilities. All 82 pending production pins remained unchanged. The idle development app was restored after the check; no national production launch or Vermont app acquisition was attempted.
