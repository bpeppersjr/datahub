# Colorado selected-delivery validation — September 8, 2026

Following the [verified metadata preflight](../CO-CHILDCARE-PREFLIGHT.md), a bounded native diagnostic tested two pages of two center records under `co-childcare-centers-internal` policy. The existing user authorization for authorized business-data collection and the verified CDEC PDDL designation provide the basis for this internal selected-field check; no account, payment, click-through, contact or access workaround was used.

## Request boundary

The fixed endpoint was `https://data.colorado.gov/resource/a9rr-k8mu.json`, GET, with exactly:

```text
$select=provider_id,provider_name,provider_service_type,street_address,city,state,zip,county,total_licensed_capacity
$where=provider_service_type='Child Care Center'
$order=provider_id ASC
$limit=2
$offset=0 (first request), 2 (second request)
```

A complete six-request preflight preceded the samples and another followed them; source and projected metadata/category/aggregate payloads matched before and after. There were 14 requests total, serial one-second spacing, no redirects or credentials, 30-second selected-request deadlines and 100,000-byte selected-response caps. Each response had exactly two rows and no unselected fields. The diagnostic did not retain provider names, addresses, license values or raw response bodies. This is not a full acquisition, a persisted app job or an independently authenticated snapshot.

| Sample | Observed UTC | Bytes | Raw body SHA-256 |
| --- | --- | ---: | --- |
| offset 0 | 2026-09-08T22:00:30.700Z | 510 | `c44710b1f0f68efc26fe55be91ea48d59b8315bda42a57bb6080864b1c6f9f3d` |
| offset 2 | 2026-09-08T22:00:31.931Z | 514 | `2e715f261751eb6fb790b93804e2a12f28f6bdfe4cc7b9d702bce60b71713ecf` |

## Observed delivery and limits of inference

All nine fields were present as strings in all four rows. `provider_id` used canonical positive integer text; IDs increased numerically across both pages with no repetition. Capacity used unsigned integer text. This verifies only these observed rows and this small offset transition. It does not establish complete page membership, whole-source scalar validity, stable identity across releases or current business operation. No null/omitted fields were observed in these four rows; future nullable optional values must be preserved distinctly, not filled with invented defaults.

The source preflight still counted 1,648 center rows. The collector must compare integer identifiers numerically without floating-point conversion, retain source text, reconcile full baseline/selected/final membership and require terminal empty pages. Source nonnull aggregates must count blank strings as nonnull. ZIP5/ZIP4 splitting belongs in subsequent normalization; original selected ZIP text remains source evidence. Missing physical-address details or capacity values are quality gaps, not authority to discard otherwise valid source records. The current source provides no coordinates or verified operating dates.
