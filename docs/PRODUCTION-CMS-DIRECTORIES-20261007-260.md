# Proposed retained-data production reconciliation — October 7, 2026

Plan 260 supersedes planning-only Plan 259 after governing Alabama childcare source discovery and integrating it beside Alaska in the Administration maintenance backlog. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-260`
- Plan confirmation SHA-256: `ceee9842becc361dd2702109438aafb6638202895adad4f547451074d7683a06`
- Plan file SHA-256: `09fca5c73ba676a7efcee997b145c8f38f9deb79e948a9fcd859bae91ff43dfb`
- Predecessor plan: `production-cms-directories-20261007-259`
- Backlog implementation SHA-256: `8c7327b95cbc39c7ed6bf3618f86180195c545cb149e8c955b842589902a5669`
- Administration implementation SHA-256: `bcff67e2721dc5b7cef3bf377e3efa507c729747d02cef80d1eb135a4ab37ae6`
- Alabama discovery SHA-256: `8c10e800f8daabbf7290626371cfc5f01144142fbcbe5d6d5fffa5f6a5954ba7`

Maintenance backlog schema 1.4 supports separate governed source-discovery results for Alabama and Alaska childcare. Alabama retains five official DHR sources, publisher-described licensed and exempt cohorts and exclusions, an unknown roster date and refresh cadence, unverified bulk/API access, prohibited portal automation, and the exact follow-up action. It does not configure a collection source, acquire provider rows, create manual or automatic collection authority, or change coverage and completeness.

Sixteen focused discovery, backlog, and Administration tests passed. Lint completed with zero errors and seven existing warnings; web and desktop builds passed; desktop control-plane smoke passed. The full repository check progressed through the affected suites successfully but later encountered the unrelated long-running `national-cms-nppes-organization-practice-location-coverage.test.mjs` replay after approximately fifteen minutes and was stopped after that reported failure. `npm audit --omit=dev` continues to report the two existing high-severity transitive advisories in `sharp` and `source-map-js`; no automatic dependency fix was applied.

The required stop/test/relaunch sequence passed. The relaunched application has exactly one listener on `127.0.0.1:4300`, and `/api/health` returned HTTP 200.

Read-only production preflight returned `READY`, revalidated every pin, and reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Available disk was 73,035,788,288 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, Alabama or Alaska directory automation, provider-row acquisition, enrollment change, public export, schedule activation, or mutable production pointer write occurred. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.
