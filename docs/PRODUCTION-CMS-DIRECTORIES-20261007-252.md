# Proposed retained-data production reconciliation — October 7, 2026

Plan 252 supersedes planning-only Plan 251 after California childcare app version 1.1 connected deterministic normalization to the application-owned operation lifecycle. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-252`
- Plan confirmation SHA-256: `1d9704460a9e97fdac8baa9b2d059fe2d0e2be2ecbcac29e448129170b9b5afb`
- Plan file SHA-256: `12cb62afa17f7e0a49ed6caef5927d493ca1fba2043b651eb7206fc6b28b68a2`
- Predecessor plan: `production-cms-directories-20261007-251`
- California app connector SHA-256: `9ec235797ab8992facbc270355d1b7a993662194eece0c936950365a507f73a0`
- California app implementation SHA-256: `74a420594e484fe20e2fd2e1b0a1558a159cf52b1ecfdb3ceebdf53080b13615`
- California internal source policy SHA-256: `b2024f1d4cf577ea868efd5b35537ebd588d3fe17027a8d256f1f499f39a2386`

The California app now persists its operation start before acquisition, independently verifies the acquired release, runs the versioned offline normalizer, persists separate acquired and normalized checkpoints, and publishes a terminal receipt binding both immutable release manifests. The terminal verifier replays both releases and requires the normalized lineage to identify the exact acquired manifest, hash, and run. Explicit retained-input mode repeats verification and normalization locally without making a publisher request.

The app remains conservative: publisher status is not proof of current operation; reported addresses are not verified sites; ZIP validity and ZCTA membership are not inferred; geocodes remain absent; public export and production admission remain false; and no current pointer is written. California is explicitly mapped as local governed childcare evidence with no admitted national reporting profile. Automatic refresh remains on HOLD with `AUTOMATIC_REFRESH_NOT_REVIEWED`.

The full repository test corpus, lint, web build, desktop build, and desktop control-plane smoke completed successfully as separate verified phases. The initial combined check's final desktop smoke encountered the already-running Collector on port 4300; after the required stop, the same smoke passed, the launcher restored the app, exactly one listener was present, and `/api/health` returned HTTP 200. Seven existing lint warnings remain. The two previously known high-severity transitive advisories remain reported by `npm audit --omit=dev`.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain pinned with the `national-12g` profile. Available disk was 73,536,917,504 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider request, provider-row acquisition, national reporting admission, public export, automatic schedule activation, or mutable source pointer write occurred. Plan 251 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-252 --expected-plan-sha256 1d9704460a9e97fdac8baa9b2d059fe2d0e2be2ecbcac29e448129170b9b5afb
```
