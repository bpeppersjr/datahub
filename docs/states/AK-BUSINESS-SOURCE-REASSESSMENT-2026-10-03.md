# Alaska Corporations source reassessment — 2026-10-03

Decision: retain `proceed-to-bounded-connector`, limited to existing offline implementation work. No acquisition or production authority is added.

The [official download landing page](https://www.commerce.alaska.gov/cbp/main/) still advertises the corporation CSV. The [Copyright Notice](https://www.commerce.alaska.gov/web/CopyrightNotice.aspx) adds materially stronger evidence for the existing redistribution gate: it addresses permission for republication and altered CSV reposting. A dataset-specific derivative-use basis remains unresolved.

The immutable observation is `config/state-business-source-assessments/ak-2026-10-03.json`. The historical 35-column schema and 44 MB size belong to September 3. No CSV prefix, record, or full download was requested in this audit. Existing prefix-preflight code can receive unparsed row bytes; describe it as bounded-prefix, never header-only.

The current [corporations guidance](https://www.commerce.alaska.gov/web/cbpl/Corporations/Corporations.aspx) requires myAlaska for online filing payments. Do not transfer that requirement to the separate download route without evidence. Administrative status/address semantics, ZIP5/ZIP4 separation and local-review exclusions remain unchanged.

Next work: maintain the existing offline module; verify fresh schema, controls, rights and admission requirements when a source run is authorized. No change to source policy, connector, runtime data, production pointer or completeness count was made.
