# Colorado childcare source-candidate normalization

The offline transformation consumes a completely replayed [Colorado acquisition](CO-CHILDCARE-ACQUISITION.md). It retains the exact sparse selected source fields, policy attribution, input hash, acquisition release, ingest run, transformation version, source-update clock and page observation time. Provider IDs remain precise integer strings in typed external identifiers and release-scoped record keys; they are not canonical business identities.

Reported name, street, city, state and county labels are preserved without inventing geography. Only the explicit CO/Colorado state aliases normalize to CO; other reported values remain visible with a state-scope conflict. A county label is not an assigned county polygon. The physical-address role comes from the licensing-application source description, not independent premises verification. Missing or nonstreet addresses remain quality gaps rather than fabricated sites.

ZIP5 and ZIP4 are separate fields. Leading zeroes are retained. Missing, malformed or all-zero ZIP5 text produces a gap; syntactic postal validity does not establish a current USPS assignment. Raw source ZIP text remains in the source evidence. No coordinates or business polygons are inferred. The selected source contains neither operating-status evidence nor license dates; category membership is not active-business verification. Capacity is parsed only as a safe nonnegative integer, with invalid text preserved and counted as a gap.

Normalized records plus quarantine references reconcile to the acquired source count. Oversized normalized rows are quarantined by source key and hash without copying their raw personal content into diagnostics. The immutable derivative binds the acquired manifest path, hash, run and execution mode. Its reader reconstructs the output offline, verifies artifact hashes and exact directory membership, and checks the source again before accepting the release.

```powershell
node scripts/verify-co-childcare-normalized.mjs --manifest <absolute-normalized-manifest>
```

Input and output must remain inside datahub. Output roots cannot be inside an existing immutable release. Cancellation removes only owned incomplete output; ambiguous publication remains available for inspection. Reuse the acquired release for reprocessing; no network request or repull belongs in normalization. These source candidates do not yet count as national coverage or verified unique active businesses.
