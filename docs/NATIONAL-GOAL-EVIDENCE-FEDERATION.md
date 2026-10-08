# National goal evidence federation

`national-goal-evidence-federation@1.0.0` provides one immutable, pointer-free view of retained national evidence. Build with `npm run goal-federation:build`; independently verify the registered release with `npm run goal-federation:verify`. All processing is local and requires no running Collector service.

The configuration pins each manifest, release identity and version, or standalone configuration/report hash. It joins the national goal completion matrix 1.3, exact-ZIP matrix 3.0, state disposition 3.0, operational crosswalk, temporal/summary projection 3.1, Census geography goal status and jurisdiction overlay, ZIP denominator gap cohort, non-ZCTA source geography context, state access ledger, configured industry roster, lifecycle eligibility manifest summary, and EPA operational segment release. Exact input paths and hashes are retained in the release manifest. No production pointer is used to select federation inputs.

Replay requires the existing retained local dependency packages. Several historical geography, cohort and lifecycle packages are locally retained rather than committed to Git; the committed federation artifacts do not duplicate those source packages. Verification on a fresh checkout without those packages fails closed. Configuration hashes bind native retained bytes, including the Windows industry configuration's line endings. Release outputs and new hash-bound contracts have explicit Git byte-preservation attributes.

## Outputs and units

There are 104 artifacts plus a manifest: `national-summary.json`, 459 rows in `state-industry-status.jsonl`, `gap-ledger.json`, `territories.json`, and 100 first-two-digit ZIP partitions under `zip-status/`. The ZIP partitions retain all 48,194 cohort keys and the status of all 51 source dimensions: 2,457,894 cells. The national summary declares the dimension-vector order. ZIP5 is always a string and ZIP4 is a separate null field in these ZIP aggregates. No names, addresses, source identifiers, coordinates or business geometries are exported.

The core state-industry metrics use only the matrix, operational crosswalk and state dispositions. Each state/DC has nine industry rows with dimension evidence availability and exact-ZIP measurement reach; percentages are derived from explicitly named evidence-cell numerators and denominators. The industry mappings have 7, 5, 2, 1, 2, 1, 2, 10 and 11 dimensions in configured crosswalk order. There are 39 mapped dimensions, 12 unmapped dimensions and 41 associations; two associations overlap. Cross-industry summation is not a unique entity measure.

The state denominator uses 33,455 dominant-state Census ZCTA-overlay keys. Separate scopes retain 14,402 non-ZCTA keys, 184 material cross-state ZCTAs, three unresolved overlays, one placeholder, and 149 territory ZCTAs (AS 1, GU 7, MP 3, PR 132, VI 6). These 60 scopes conserve 48,194 ZIP keys. Source-reported jurisdiction evidence is a separate sidecar and must not be mixed into the Census-overlay denominator.

EPA facility memberships, source-profile lifecycle decisions, state-access counts and the broad-business goal matrix remain typed sidecars with their own units, source dates and pins. They do not enter core evidence-cell numerators or denominators. The lifecycle summary is taken from its checksum-bound manifest; its 8,011,835 decisions are not replayed in this federation. Publisher authentication and upstream raw normalization are not repeated. The full exact-ZIP matrix is independently replayed, including each scope's dimension-status partition.

## Gaps and maintenance

The retained inputs prove 40 states/DC without a retained broad organization layer, 150 unsupported industry-access cells plus two unmeasured cells, and two stale temporal dimensions plus 20 unmeasured dimensions. Each gap has a next-action class. Missing broad evidence enters admission review and preserves upstream authority evidence; absence does not establish that acquisition is prohibited or authorized. Acquisition/refresh and publisher authority require their existing governed workflows.

The nine industry buckets are hash-pinned from application configuration. This release does not snapshot mutable operator maintenance selections or enable refresh schedules. The Administration tab remains the owner of those selections.

Missing population, geocodes, USPS validation or an all-business denominator do not block this status release or the map. Private/unique ZIP, park, tribal and private-land classifications are not inferred. Non-ZCTA contexts preserve reported codes and point-state evidence separately; they do not assign a postal boundary or state polygon.

## Publication and verification

Preflight rejects unsafe paths, symlink ancestry, changed pins and unsupported versions. Each build uses an exclusive lock and its own staging directory. Streams and ZIP loops honor cancellation. Publication occurs after independent semantic reconstruction and verification of every output, with pins, contracts and artifacts rechecked after publication hooks. The manifest is written last and the verified directory is atomically renamed. Existing release directories are never overwritten. Cancellation or failed verification removes only owned staging/verification directories and releases the build lock.

Verification rejects missing/extra artifacts, changed bytes/hashes, count changes, claim changes and semantically repinned output tampering. Historical input layers remain immutable. Removing the dataset registration disables this release's selection; historical source releases and application production pointers remain available for rollback.

## Application follow-up

A bounded authenticated summary endpoint and Industry Status panel should read the hash-pinned federation registration, manifest and `national-summary.json` only, display its source dates and known gaps, and retain independently loaded existing Industry Status data on failure. The panel must label state percentages as evidence reach and offer state/industry drill-downs into `state-industry-status.jsonl`. ZIP detail should read one first-two-digit partition. Runtime requests must not execute the full replay verifier, create releases, schedule acquisition, or infer business completeness.
