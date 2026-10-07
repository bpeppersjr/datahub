# Arizona childcare source discovery — October 7, 2026

Arizona has several official but non-equivalent child-care sources. ADHS publishes downloadable monthly XLSX tables for child care centers and group homes. A retained metadata-only preflight verified the exact September 2026 workbook URLs, response types, sizes, and last-modified timestamps without requesting either workbook body or acquiring provider rows. The immutable preflight manifest is replayed whenever this discovery record is loaded.

ADHS also publishes a query-capable ArcGIS child-care layer with licensing, status, address, ZIP, and geocode fields. Although its description says it is updated monthly, its public edit metadata appears frozen in February 2025. The layer is therefore only a conditional connector candidate, not current 2026 facility evidence. AZ Care Check and the DES consumer search remain human-facing context sources without a verified bulk contract.

The ADHS and DES cohorts must remain separate. ADHS license or certification, DES certification or contracting, CCDF eligibility, relative-provider status, consumer-search membership, and current subsidy acceptance are not interchangeable and do not independently prove current operation.

The governed record is `config/source-discoveries/az-childcare-2026-10-07.json`. It records the official XLSX bulk publication as verified while keeping workbook-body acquisition, ArcGIS API admission, portal automation, provider counts, current operation, statewide completeness, and production admission disabled or unknown. ZIP5 and ZIP+4 remain separate fields.

The next action is a separately authorized acquisition and schema-validation step for one exact monthly workbook, including run-date, selected public fields, stable identifiers, status dictionaries, row conservation, retention, and redistribution terms. The stale GIS metadata must be resolved independently before its API can be considered current.
