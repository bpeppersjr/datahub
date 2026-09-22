# USPS City State registry preview

`runner/usps-city-state-registry-preview.mjs` and
`scripts/preview-usps-city-state-candidate.mjs` provide a read-only local
preview over a verified USPS City State denominator candidate.

The preview always replays the exact admission manifest, operator-managed
JSONL input, and status mapping through
`verifyCityStateDenominatorCandidate`. It returns bounded, paginated ZIP5
rows with candidate membership, ZIP class, source status, source month and
version, candidate release/hash, row provenance, `zip4: null`, and the
`local-restricted` policy. An optional caller-supplied JSON array of ZIP5
strings produces `not-listed-in-reviewed-usps-city-state-operational-candidate`
rows. That status means absence from the selected candidate only; it is not a
validity, deliverability, operational, business, or completeness assertion.

The preview performs no network requests, writes no artifacts or current
pointer, does not alter the national registry builder, and does not include
Census ZCTA geometry. No authenticated API endpoint is exposed because no
fixed governed candidate selection is enrolled.

Example:

```text
npm run usps-city-state:preview -- --candidate-manifest <manifest> --admission-manifest <admission> --input <city-state.jsonl> --status-mapping <mapping.json> --zip-universe <zip5.json> --limit 100
```

