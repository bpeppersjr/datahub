# National business-registry source-freshness audit

This pointer-free local audit compares the selected national business-registry release with the 25 normalized ZIP5/ZIP4 source releases in the frozen postal-migration candidate set. It recomputes candidate readiness, requires each dataset to occur exactly once in the registry dependency list, compares release IDs and manifest hashes, and requires each production pointer to be byte-identical to its isolated candidate pointer.

The pinned registry is `national-business-registry-20260911-022652067Z-1ec656c3`, manifest SHA-256 `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`. The pinned postal definition file SHA-256 is `2f3aaf19c64e9d1032c8d785c93aead47128e7bb7ac87930b52abfa4a560713b`; its frozen candidate-readiness hash is `bf6bcf0a063328d8dba9e61bfc41a2a3ae81a273486a32da3b8f9fa2ad5002aa`.

The expected result is 25 ready sources, 25 exact registry dependency matches, 25 byte-identical production/candidate pointers, and zero different, missing, or duplicate bindings. This means a source refresh is unnecessary. A no-download registry replay is source-input-safe only at this 25-source boundary; all 85 registry dependencies and normal build resource, lock, and publication gates must still be checked before any separately authorized replay.

Run `npm run registry:source-freshness:verify`. The audit performs no network request, download, build, pointer mutation, production action, candidate action, or freshness advancement. It is not evidence of completeness or current operation.
