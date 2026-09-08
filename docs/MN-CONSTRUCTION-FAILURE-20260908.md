# Minnesota collection: streaming failure and diagnostic repair

The app-owned operation `cd9c3c93-ab0c-429e-9553-ef6252625ac0` ended `FAILED` at 2026-09-08T12:52:40.487Z. Both cohort jobs passed the recorded notice/schema prerequisites and retained partial selected frames, but neither published a completed acquisition. No retry was submitted during this investigation.

## Retained evidence

| Cohort | App job | Partial selected frames | Terminal receipt SHA-256 |
| --- | --- | ---: | --- |
| Registrations | `050b4492-26e6-44f6-b5eb-a96fa1c365e5` | 2,195 | `d966f3b1d0ab39495bfcf849d30fb8a461668c0aa31d065b631968603869cce3` |
| Residential | `4214df84-2800-4fa9-93ac-c0c774c97489` | 13,067 | `c4bea2abcfda3b448c17af0a2ccbbb8700c98b33efd39ef15cee56ddc7851448` |

The independent app verifier accepts both historical failure envelopes with `acquisition: null`. Neither contains a diagnostic sidecar. Frame counts describe retained prefixes, not completed datasets, accepted-business counts or coverage. Partial frames and prerequisite history remain unchanged and must not be promoted.

## What is known and unknown

Processing stopped before a selection receipt was published. Each cohort failed approximately thirteen seconds into its acquisition turn, below its 120-second body timeout. Retained prefixes are ASCII. Invalid UTF-8 is a plausible cause, as is CSV syntax or another stream/transport failure; these observations do not prove an encoding mismatch. No raw CSV was retained, and generic historical errors cannot establish the exact cause retrospectively.

The definite software defect was loss of failure classifications across decoding, parsing, retained-selection, acquisition, publisher-gate and app wrappers. New diagnostics preserve fixed categories through those boundaries without preserving source values, parser text, arbitrary error properties or response bodies. The app persists an optional `diagnostic.json` on new failures; independent app verification validates its shape and returns `failure_diagnostic`. This is advisory app-reported failure context, not a signed or source-authenticated claim. Old failures remain valid without it; success artifacts and enrollment pins are unchanged.

Tests cover malformed UTF-8 after a valid CSV prefix, malformed quoted CSV, sink failure, untrusted error-property redaction, final-versus-initial source checks, end-to-end diagnostic persistence and rejection of an unknown diagnostic value. Existing selection and acquisition verification remains strict. No encoding fallback, relaxed parsing, source retry, automatic recovery or retrospective diagnostic was added.

## Next action

Subsequent evidence: [the bounded encoding investigation](MN-CONSTRUCTION-ENCODING.md) confirms that the observed registrations prefix is not valid UTF-8. It does not establish a replacement charset, the residential source encoding, or a retrospective detailed error for the failed jobs.

Validation of the diagnostic repair: `npm run check` passed with 1,065 tests passed, 11 skipped and zero failures, plus lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` found zero vulnerabilities. All 82 pending national production code/configuration pins remain unchanged. The two historical failed app receipts were independently verified without source requests.

Investigate the actual source encoding/stream boundary using bounded, policy-compliant evidence before deciding whether a new acquisition is necessary. Do not label the historical cause as proven, infer missing rows, publish the partial files or weaken source validation simply to obtain a successful run. Any subsequently needed acquisition belongs to the app, not an agent download loop.
