# DC Corporate Registration offline packages

Place each operator-supplied package in `packages/<package-id>/`. A package is closed and contains exactly the files named by `selection.json`: a complete privacy-selected active-record JSONL/NDJSON file (optionally gzip compressed) and its fresh validated metadata/count-only preflight receipt. The application performs no discovery or network request.

Copy `selection.example.json` into the package directory, set `package_id` to the directory name, and name both package-local files. Do not include email, registered-agent, person, owner, geometry, or geocode fields. ZIP5 and ZIP4 remain separate only in normalized output; the source `ZIPCODE` field is retained as source evidence.

Run:

```powershell
node scripts/run-dc-corporate-registration-app.mjs --selection data/imports/dc-corporate-registration/packages/<package-id>/selection.json
```

This creates only an operation-scoped, local-review-only release and durable receipt. It does not change a current pointer or admit records to national coverage.
