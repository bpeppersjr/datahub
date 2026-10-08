# Illinois broad-organization admission readiness

The Data Operations status card performs a bounded, read-only scan of the fixed local Illinois application-operation directory. UUID operation directories with safe terminal receipts are passed to the existing independent Illinois app verifier. The evaluator performs no source request, network request, file write, operation start, approval, promotion, admission, or pointer change.

Package evidence is reported distinctly as:

- `absent`: no candidate UUID operation receipt was found;
- `terminal-non-success`: independently valid failed or cancelled receipts exist, but no verified successful package exists;
- `corrupt`: at least one candidate cannot pass independent receipt verification and no successful package was verified;
- `verified`: at least one successful, local-review-only, zero-network receipt and retained release passes independent verification.

Valid failed and cancelled receipts are counted separately from corrupt evidence. If successful and corrupt evidence coexist, the top-level status is `verified`, while both counts remain visible. The production reader binds directly to the existing Illinois verifier; neither the endpoint nor its callers can substitute a verifier or operations root.

Errors, filesystem paths, operation identifiers, organization names, addresses, source identifiers, and row data are not returned by the management endpoint.

The evaluator is pinned to assessment `il-business-source-reassessment-2026-10-03` and its exact seven unresolved gates. A verified receipt may provide supporting evidence for only:

- `operator-supplied-complete-same-run-package`;
- `independent-package-verification`.

Even those two gates remain unresolved pending explicit governed review. The receipt cannot prove or close automated retrieval authorization, retention and downstream-use rights, actual publisher freshness, archive/replay guarantees, or separate national admission. All seven `closure_state` values remain `unresolved`; no authority or readiness uplift is granted.

The protected endpoint accepts only an empty `GET`:

```text
/api/data-operations/illinois-broad-organization-admission-readiness
```

The UI recheck aborts an earlier in-flight read, ignores stale completions, and clears cached evidence on failure. Recheck is observation only and exposes no execution or approval control.
