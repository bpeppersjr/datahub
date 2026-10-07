# Proposed retained-data production reconciliation — October 7, 2026

Plan 261 supersedes planning-only Plan 260 after governing Arkansas and Arizona childcare source discovery and integrating their distinct readiness states into Administration. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-261`
- Plan confirmation SHA-256: `fd6eca580b007e9884036609e2e332b49c5f5f51cd039dabacefee94bb2d40d1`
- Plan file SHA-256: `fc90ec623a0cf84a8f0983524dbfc1e4dc1908e66c84b6c9ffe8311d1ae95084`
- Predecessor plan: `production-cms-directories-20261007-260`
- Backlog implementation SHA-256: `67ac036599d94b7f8e722d267c119b86aa8b216f3e44f73d28a28243333b9edb`
- Administration implementation SHA-256: `7939f15e5ff28306c8759c4c53526994443cd6c7c0ba2fd9a3217343718aec22`
- Arkansas discovery SHA-256: `94673d9900632af72f522090d3e09f23046b4ae33e09e5ee23b7177f0c8a2c04`
- Arizona discovery SHA-256: `cd59671f670f712d394b1af3b7d9323a4032c34e9d8141aed8b858cdb18b8212`

Maintenance backlog schema 1.5 now preserves four independent childcare discovery decisions. Alaska, Alabama, and Arkansas have official human-search sources without verified supported bulk/API access or portal-automation authority. Arizona has verified official monthly XLSX publication metadata, bound to an independently replayed zero-row preflight, while workbook-body acquisition remains disabled. Arizona's query-capable GIS layer remains a conditional candidate with an unresolved February 2025 freshness conflict. No discovery becomes a configured collection source or grants acquisition authority.

Eighteen focused discovery, backlog, and Administration tests passed. Lint completed with zero errors and seven existing warnings; web and desktop builds passed; desktop control-plane smoke passed. The preceding full repository check had already passed the affected suites before encountering the unrelated long-running NPPES replay failure documented in Plan 260. The existing `sharp` and `source-map-js` audit advisories remain unchanged; no automatic dependency fix was applied.

The required stop/test/relaunch sequence passed. The relaunched application has exactly one listener on `127.0.0.1:4300`, and `/api/health` returned HTTP 200.

Read-only production preflight returned `READY`, revalidated every pin, and reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Available disk was 73,029,726,208 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, public-directory automation, Salesforce reverse engineering, ArcGIS acquisition, workbook download, provider-row acquisition, enrollment change, public export, schedule activation, or mutable production pointer write occurred. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.
