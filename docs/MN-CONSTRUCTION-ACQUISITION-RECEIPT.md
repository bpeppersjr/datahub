# Durable Minnesota acquisition evidence

Implemented September 8, 2026. Co*Tive can now persist and independently replay the parent evidence linking a Minnesota transfer to its selected records. This is a prerequisite for app-owned downloads, not evidence that a native worker has been enrolled or dispatched.

## Contract

`buildMnConstructionAcquiredSelection` now returns `mn-construction-acquired-selection@1.1.0`, adding the complete schema preflight and exact retained child-manifest SHA-256. The old in-memory 1.0 result lacked these independent replay inputs and is not accepted by the new writer. Existing retained bundle manifests are unchanged and are not rebuilt or downloaded again for verification.

`runner/mn-construction-acquisition-receipt.mjs` provides:

- `verifyMnConstructionAcquiredEvidence`: snapshot the input, replay both notice bindings at their recorded check times, validate exact source metadata/byte measurements and chronology, and independently verify the linked child bundle.
- `writeMnConstructionAcquisitionReceipt`: snapshot, verify and save immutable UUID JSON evidence under `data/business-sources/mn-dli-construction/acquisitions` by default.
- `verifyMnConstructionAcquisitionReceipt`: bounded disk reads, full evidence and child replay, then a second receipt read to detect changes during verification.

The parent pins the child manifest's actual file-byte SHA-256, the schema preflight's canonical JSON hash, both complete notice receipts/bindings, transfer measurements and source cohort. It independently compares the measured source hash/count against the privacy-selected stream receipt and returns the run/source-release identities from that verified child. ZIP5/ZIP4 remain separate, and no physical-site, active-business or unique-entity claim is added.

## Publication and cancellation

The writer uses the existing Minnesota app-contained, alias-rejecting, bounded I/O primitives. Parent evidence is capped below 2 MB. It rejects output escapes, release/staging ancestry and existing manifest-bearing bundles. An exclusive UUID temporary file is fsynced, reread and replayed before a no-overwrite link/unlink publication. Concurrent writers receive separate UUIDs; existing receipts and child bundles are not overwritten.

Both the public verifier and writer snapshot caller input before their first asynchronous operation, so later caller mutation cannot change which claims were validated or hashed. Cancellation before publication removes only the owned temporary file, leaving prior receipts and child data intact. Ordinary failures retain partial evidence for diagnosis. Once publication begins, cancellation does not remove the committed receipt. A subsequent integrity failure is reported, not silently accepted or repaired; always verify before reuse. Automatic crash recovery, stale-lock handling and resume are not implemented by this receipt layer.

No source rows or contacts are added to the parent file. It contains internal publisher-notice articles and technical evidence, so the CLI emits only summary identifiers, hashes and counts—not the article bodies. Receipt replay performs no network requests.

```powershell
node scripts/verify-mn-construction-acquisition.mjs --receipt data/business-sources/mn-dli-construction/acquisitions/RECEIPT-UUID.json
```

Replace the placeholder with an actual receipt path inside `datahub`.

## Evidence boundaries

A verified parent reports `evidence_persisted: true` and status `verified-injected-acquisition-evidence`. Its captured in-memory result still correctly records `evidence_persisted: false` at that earlier boundary. Native acquisition verification, source authenticity, app enrollment and national reporting remain false. Reconstructing a historical policy binding is not permission to start a new download today.

The app wrapper must still own its operation start/checkpoint/terminal receipts, enrollment contract and shared Minnesota publisher lock/budget. It will bind its native execution mode to the independently verified parent receipt. The two fixed cohort entry points and industry registration remain to be implemented. Only an actual accepted app operation ID and persisted operation receipt complete handoff; do not keep agents occupied with routine downloads after that handoff.

## Tests and rollback

Seven additional integration subtests exercise concurrent immutable parent writes, independent child/hash linkage, source/policy/chronology/claim tampering, caller mutation during replay, cancellation before and during write, invalid output paths, linked files, rehashed disk tampering and the standalone CLI. They use synthetic CSV and the exact internally retained notice receipt without network access. The enclosing test explicitly skips where that internal notice fixture is absent; all these tests ran locally.

Full validation passed: 1,043 tests discovered, 1,032 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. `npm audit --omit=dev` found zero vulnerabilities. All 82 pending national memory-plan code/configuration pins remained unchanged. The local preview was restored after validation.

Rollback is to stop calling the new receipt layer. Do not delete retained evidence or move production pointers. No production rebuild pins, full downloads, schedules or national coverage changed in this step.
