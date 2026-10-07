# Arkansas childcare source discovery — October 7, 2026

The Arkansas Department of Education Office of Early Childhood provides an official statewide child-care search backed by a human-facing Salesforce directory. Official materials describe searches by city, ZIP, county, facility name, star level, hours, ages, availability, and support services. The state plan identifies licensed providers and additional named program types, while OEC materials separately define licensed centers, licensed homes, registered family homes, out-of-school-time facilities, subsidy participation, quality ratings, and church-operated exemptions.

These classifications are not interchangeable. In particular, the official statement that Arkansas has no license-exempt CCDF provider category does not prove that legally church-exempt facilities do not exist. Directory presence does not prove School Readiness Assistance participation, and licensing or registration does not prove current operation at another date.

No ADE/OEC-published provider CSV, XLSX, JSON roster, supported public API, data dictionary, roster-wide timestamp, refresh SLA, pagination/control-total contract, or affirmative automation permission was verified. Salesforce implementation calls are not treated as a supported API. Co*Tive therefore does not automate or reverse-engineer the directory, infer provider totals, or collapse credential, subsidy, and quality-rating facts.

The governed record is `config/source-discoveries/ar-childcare-2026-10-07.json`. It preserves the official source scope, the credential and cohort distinctions, temporal uncertainty, and an eventual minimum record contract with separate ZIP5 and ZIP+4 fields. No provider rows were acquired.

The next action is to request an official ADE/OEC machine-readable extract or written authorization including its schema, stable identifier, credential cohorts, pagination, terms, and temporal contract. Acquisition and production admission remain disabled.
