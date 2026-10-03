# Rhode Island business-source reassessment — 2026-10-03

HOLD remains with clearer prerequisites. Direct retrieval of the linked [agreement](https://docs.sos.ri.gov/documents/BusinessServices/Subscriber_Agreement.pdf) shows revision 12/2025, including static-IP SFTP and an Active product that includes recently revoked entities. Indexed older text must not replace that observation. The [product page](https://www.sos.ri.gov/divisions/business-services/business-data-hub/data-subscription) lists one-time and annual routes.

The [2007 weekly layout](https://business.sos.ri.gov/corp/WeeklyCorpExport/filestructure.htm) is historical schema evidence, not proof of current subscription compatibility. Clarify that compatibility, posting versus snapshot/delta semantics, identifier lifecycle, address roles and reuse scope. No source records or ordering actions occurred.

Immutable evidence: `config/state-business-source-assessments/ri-2026-10-03.json`. Integration export: `loadRhodeIslandBusinessSourceReassessment` from `runner/wyoming-rhode-island-south-dakota-business-source-reassessment.mjs`. It supersedes only RI in queue-4 wave-2 of 2026-09-03. All authority remains false. Tests reject fact and authority mutation; no runtime migration or data change. Catalog selection can revert to preserved historical evidence.
