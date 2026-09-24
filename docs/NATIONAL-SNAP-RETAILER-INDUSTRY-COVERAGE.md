# National SNAP retailer industry coverage

This immutable, non-additive layer summarizes one retained USDA FNS SNAP authorized-retailer release by jurisdiction and ZIP5. It reuses the governed Census ZCTA index and performs no network or acquisition work.

The unit is a source retailer-location record with SNAP authorization as of the source update. It is not a unique business, proof of current operation, all grocery retail, or a completeness claim. USDA store-type labels remain unchanged and are not NAICS. ZIP+4 is counted separately from ZIP5. Retained source coordinates are counted but no new geometry is created.

The layer is excluded from generic business, entity, site, category, and export totals. `current.json` pins a verified immutable manifest; publication uses exclusive locks, staging verification, atomic rename, and compare-and-swap rollback for the pointer.

Build with `npm run snap:coverage:build` and verify with `npm run snap:coverage:verify`.
