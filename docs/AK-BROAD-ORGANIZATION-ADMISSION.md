# Alaska broad-organization admission candidate

This offline workflow turns the already retained and verified Alaska active-business-license release into a compact, versioned admission candidate. It does not acquire data, alter a current pointer, enroll production, or change the national coverage matrix.

The builder pins the exact source release and manifest hash, verifies all 22 retained artifacts by path, byte count, and SHA-256, and proves these conservation identities:

- source license rows = normalized organizations + quarantined rows;
- normalized organizations = provisional site-eligible assertions + organizations without an eligible address;
- source NAICS rows = distinct license/NAICS pairs + collapsed duplicate rows;
- licenses with NAICS + licenses without NAICS = source license rows; and
- the 16 normalized shards sum to the normalized organization count.

The resulting candidate is deliberately narrow. A row is source-defined active license evidence for one provisional organization. It is not proof of current operation, a verified physical site, a geocode, ownership, a complete establishment inventory, or a completeness numerator for all Alaska businesses. The 94,550 address-eligible records remain withheld as sites in this admission candidate.

Run `node scripts/build-ak-broad-organization-admission.mjs` to create the deterministic release under `data/ak-broad-organization-admission-candidate/releases/`. No `current.json` is written.

Inputs must be canonical, single-link regular files inside `datahub`. Reads are byte-bounded and checked before, during, and after hashing. Selection and published-manifest envelopes reject unknown fields. Publication is confined to the canonical `datahub` root, uses an exclusive per-release lock and unique staging directory, writes the manifest last, and makes the completed directory visible with one rename. Concurrent publishers either replay the completed release or fail closed; cleanup never targets another publisher's staging directory.
