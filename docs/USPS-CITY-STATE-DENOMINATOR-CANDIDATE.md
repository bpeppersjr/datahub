# USPS City State operational-denominator candidate

This is a separate, bounded candidate dataset. It is built entirely offline from two operator-managed inputs: (1) a verified `usps-city-state-admission@1.0.0` manifest and (2) the exact same operator-managed City State JSONL whose byte count and SHA-256 are named by that manifest. The builder independently reads and parses the JSONL, recomputes its row/class/status conservation, and refuses a mismatch.

The candidate uses the USPS City State Product only. It is never relabeled as an Area or District product. It is local-restricted metadata plus a derived selected-ZIP5 JSONL. It does not create a current pointer, enter production, authorize redistribution, establish ZIP+4, create ZCTA geometry, prove address deliverability, or claim a complete business universe.

## Status semantics and completeness

The operator supplies a separate status map containing a non-secret `semantics_reference`. Every status observed in the exact JSONL must be present in the map, and every map entry must declare `disposition` (`included` or `excluded`), a non-secret `meaning`, and a non-secret `reason`. Unobserved map entries are rejected so the release cannot silently carry unused semantics. Only explicitly included statuses enter the derived candidate artifact; excluded statuses remain in the conservation and exclusion counts.

All four City State ZIP classes—`standard`, `po-box`, `unique`, and `military`—must be declared included by the verified admission and must each contribute at least one selected candidate row. Each selected row has the governed split postal fields (`zip_code` and equal `postal_code` as string five-digit values, with `zip4: null`), City-State-specific `assignment_status` and `evidence_scope`, `deliverability_status: not-asserted`, `zcta_status: not-asserted`, source month/version, observation/creation clocks, local-restricted export policy, and provenance binding the admission, exact source SHA-256, status-map SHA-256/semantics reference, transformation version, and policy ID. ZIP+4 is a separate address-level concept and is absent from this dataset. ZCTA polygons are a separate Census geography and are absent.

## Offline build and verification

```powershell
npm run usps-city-state-denominator:build -- --admission-manifest data/private/city-state-admission/manifest.json --input data/private/city-state-zip5.jsonl --status-mapping data/private/city-state-status-map.json
npm run usps-city-state-denominator:verify -- data/zip-validity/usps-city-state-operational-denominator/releases/<release-id>/manifest.json
```

The source profile, dataset contract, connector contract, and policy are separate files:

- `config/source-profiles/usps-city-state-operational-denominator.json`
- `config/datasets/usps-city-state-operational-denominator-candidate.json`
- `config/connectors/usps-city-state-operational-denominator-candidate.json`
- `config/source-policies/usps-city-state-operational-denominator-candidate.json`

The publisher uses canonical app-contained paths, restricts output to `data` (including test fixtures under `data/tmp`) and rejects `data/worktrees`, rejects symlinks and multi-link files, and reads every input through one opened file handle while comparing the handle and path identities before and after the read. The derived artifact and receipt are written before `manifest.json`; the manifest is published last. Existing releases are never overwritten. Cancellation before publication removes only the new staging directory. The manifest pins exact bytes and SHA-256 values for the connector, dataset, policy, and source-profile configuration files; a later verifier rejects any config drift. A final verifier replays the admission, source, status map, profile, candidate artifact, hashes, and conservation before the release is accepted.

No source download, network request, credential handling, registry integration, production admission, or current-pointer update is implemented by this lane. Any future denominator adoption requires a separate reviewed contract and production migration.
