# Licensed USPS City State offline admission

This lane validates an operator-provided, license-authorized ZIP5 projection without accessing USPS, accepting credentials, copying the licensed projection, changing a current pointer, or enrolling production. It produces only an immutable local-restricted receipt and manifest under `data/zip-validity/usps-city-state/admissions`.

The input is UTF-8 JSON Lines. Each unique ZIP5 occurs once and each row contains exactly `zip5`, `zip_class`, and `status`. `zip_class` is one of `standard`, `po-box`, `unique`, or `military`; `status` is a source-mapped lowercase token. The operator separately supplies exact SHA-256 and byte length, source month/version, a non-secret license or written-permission reference, and a declaration marking every supported class included or explicitly excluded with a reason. Every included class must have at least one row. The receipt conserves total rows, unique ZIP5, class counts, and status counts.

The projection must be prepared locally under the applicable USPS license. Do not place licensed rows, credentials, license documents, or proprietary layouts in Git. The admission does not prove address deliverability. ZIP+4 remains an address-level field and is absent; Census ZCTA remains a separate statistical geography and is absent.

```powershell
npm run usps-city-state:admit -- --input data/private/city-state-zip5.jsonl --declaration data/private/city-state-classes.json --source-month 2026-09 --source-version CITYSTATE-2026-09 --sha256 <lowercase-sha256> --bytes <exact-bytes> --permission-reference <non-secret-reference>
npm run usps-city-state:verify -- data/zip-validity/usps-city-state/admissions/<admission-id>/manifest.json
```

The declaration JSON must contain all four class keys. Example structure (not licensed data):

```json
{"standard":{"disposition":"included"},"po-box":{"disposition":"included"},"unique":{"disposition":"included"},"military":{"disposition":"excluded","reason":"Explicitly outside the licensed extract."}}
```

This artifact is only a governed prerequisite. A separate reviewed change must define any downstream denominator adoption, compatibility checks, and production promotion.
