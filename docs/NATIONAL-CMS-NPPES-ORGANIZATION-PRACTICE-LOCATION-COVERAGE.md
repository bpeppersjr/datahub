# National CMS NPPES Organization Practice-Location Coverage

This implemented-release-only layer replays the exact retained CMS NPPES August 2026 V2 organization release and publishes aggregate primary and non-primary practice-location counts by jurisdiction and reported ZIP5.

The layer performs no acquisition or network requests. It pins source, geography, and contract hashes; publishes through content-addressed immutable releases and an atomic current pointer; and serves runtime reads from verified aggregate artifacts without replaying source records.

Primary and non-primary practice-location measures are separate and mutually exclusive. They are provider-reported location evidence for active Entity Type 2 NPIs, not proof of licensure, credentials, currently open premises, public access, ownership, unique businesses, USPS validity, or nationwide completeness.

The retained source contains 1,606 duplicate non-primary practice-location rows. The aggregate explicitly accounts for and excludes that duplicate residual so source rows conserve across accepted, excluded, rejected, and deduplicated outcomes.

Only aggregate counts are exported. Organization names, NPIs, addresses, telephone numbers, taxonomies, source identifiers, raw records, and quarantine records are excluded. The layer is non-additive to generic business, entity, site, category, pharmacy, and export totals.
