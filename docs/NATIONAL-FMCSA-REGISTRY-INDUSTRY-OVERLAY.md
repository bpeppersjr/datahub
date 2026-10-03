# National FMCSA registry industry overlay

This pointer-free, local-review-only derivative classifies the exact retained FMCSA principal-office cohort already represented in the national business registry. It performs no acquisition, network access, identity resolution, production enrollment, or pointer write.

The overlay replays each accepted retained record's typed `usdot_number` against both deterministic registry identities: `site:fmcsa_usdot_<USDOT>_principal_office` and `establishment:fmcsa_usdot_<USDOT>_principal_office`. Processing is bounded to one ZIP-prefix source shard and its corresponding registry entity partitions at a time. Membership output remains in ten ZIP-prefix shards. Duplicate USDOT values, missing or extra same-source identities, changed artifacts, source/registry/coverage count drift, and incomplete ZIP or jurisdiction inventories fail closed.

The evidence unit is a source-defined active FMCSA registration with an accepted reported U.S./territory principal-office address as of the retained source update. It is not a unique business, independently verified current operation, verified physical site, public location, vehicle base, storefront, complete carrier universe, complete trucking or transportation universe, authoritative current USPS ZIP, or nationwide completeness measure. FMCSA roles and classes are nonexclusive and are not summed. Every row is non-additive to registry organizations, sites, establishments, categories, exports, and generic-business totals.

Build with `node scripts/build-national-fmcsa-registry-industry-overlay.mjs`. Verify an immutable release with `node scripts/verify-national-fmcsa-registry-industry-overlay.mjs --manifest <path>`. Both commands use only exact retained pins.
