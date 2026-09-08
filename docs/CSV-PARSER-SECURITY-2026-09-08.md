# CSV parser security update — September 8, 2026

During Maryland acquisition development, the production dependency audit began reporting moderate advisory [GHSA-8cw4-87c7-c6xx](https://github.com/adaltas/node-csv/security/advisories/GHSA-8cw4-87c7-c6xx). The publisher identifies prototype replacement through duplicate special headers with `columns` and `group_columns_by_name` enabled, and identifies 7.0.2 as the patched release. This is a dependency finding, not evidence of an exploited source or host.

The direct `csv-parse` dependency moves from 6.2.1 to 7.0.2 with its lockfile integrity pin. Only this package changed. The [publisher changelog](https://github.com/adaltas/node-csv/blob/master/packages/csv-parse/CHANGELOG.md) explains that the 7.0.0 major version was accidental rather than a breaking release, but also records parser changes, including whitespace handling. Compatibility is therefore checked rather than assumed from that statement.

New synchronous and streaming tests verify that duplicate `__proto__` headers become own data properties without replacing the record prototype. Additional checks preserve quoted newlines, ZIP5/ZIP4 strings with leading zeros, callback behavior and strict malformed-quote errors. The full repository suite exercises existing source parsers and retained-processing contracts. No retained dataset is rewritten or repulled by this upgrade.

The app was confirmed idle and stopped before the install. Lifecycle scripts were disabled during package installation, and the package cache stayed inside `datahub`. The post-install audit returned zero vulnerabilities. Historical production implementation/source pins are unchanged, but that does not mean the dependency environment is identical: any future authorized production run must account for the new parser version. The previously denied national launch was not retried or bypassed.

Do not roll back to the affected parser merely to restore a green result. If a source-specific compatibility regression appears, preserve its retained evidence and investigate the parser contract before resuming that source.

Verification completed with two new focused security/compatibility tests and the full repository check: 1,280 tests, 1,269 passed, 11 explicitly skipped, zero failed; lint, builds and desktop smoke passed. Type checking passed. The shared validation log is `data/tmp/md-childcare-acquisition-full-check.log`. Skipped private-source fixtures are not claimed as exercised, and the suite is not proof that every possible provider CSV variant is compatible.
