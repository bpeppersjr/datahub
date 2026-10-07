# Alaska childcare source discovery — October 7, 2026

The Alaska Department of Health identifies AKCCIS as its public child-care provider search. The official FAQ says the tool includes State of Alaska and Municipality of Anchorage licensed providers, Child Care Assistance Program participants, and approved license-exempt CCAP providers. Anchorage separately confirms its licensing authority and also directs users to the AKCCIS facility map.

This establishes an official discovery path, not a bulk-data contract. No supported export or API, stable schema, pagination/control-total contract, status codebook, snapshot date, or automation permission has been verified. Co*Tive therefore does not automate the public search portal, infer a provider total, or treat licensed and CCAP cohorts as unique additive businesses.

The governed discovery record is `config/source-discoveries/ak-childcare-2026-10-07.json`. It reserves the minimum eventual record contract—name, stable publisher identifier, source status and date, reported address, separate ZIP5/ZIP4, optional source coordinates, and a cohort/type field—while keeping acquisition and production disabled.

The next action is to identify or request an official supported export/API and retain its terms, schema, pagination, temporal, and state-versus-Anchorage authority contracts before any provider-row acquisition.
