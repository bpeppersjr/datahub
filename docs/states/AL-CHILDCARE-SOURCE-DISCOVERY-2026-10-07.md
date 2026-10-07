# Alabama childcare source discovery — October 7, 2026

The Alabama Department of Human Resources identifies an official statewide child-care search, a separate licensed day care home directory, and an interactive map. The approved 2025–2027 CCDF state plan describes the searchable directory as including licensed providers plus specified license-exempt center-based cohorts, while excluding license-exempt family-care CCDF, relative CCDF, and other cohorts such as summer camps and public pre-K.

This establishes an official discovery path, not a supported machine-readable data contract. No documented provider CSV/JSON export, API, data dictionary, pagination/control-total contract, roster as-of date, refresh cadence, history-retention policy, or affirmative automation permission was verified. An ASP.NET form or an interactive Power BI implementation is not treated as a supported API. Co*Tive therefore does not automate either public directory, infer a provider total, or equate Licensed, Exempt, CCDF participation, and quality-rating attributes.

The governed discovery record is `config/source-discoveries/al-childcare-2026-10-07.json`. It preserves the official URLs, publisher-described inclusion and exclusion cohorts, temporal uncertainty, eventual minimum record contract, and the fact that no provider rows were acquired. ZIP5 and ZIP+4 remain separate fields; coordinates may be retained only when published by the source.

The next action is to obtain Alabama DHR written permission and a recurring machine-readable extract or documented API, including its schema, stable identifier, cohort, status, pagination, terms, and temporal contracts. Until then, public search automation and production admission remain disabled.
