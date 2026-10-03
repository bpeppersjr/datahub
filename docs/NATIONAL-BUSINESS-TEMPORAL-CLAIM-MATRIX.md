# National business temporal-claim matrix

This pointer-free local-review derivative preserves the temporal vocabulary of all 30 sources in the pinned national registry and coverage releases. It does not acquire data, count active businesses, infer closure, calculate completeness, enroll production, or write a current pointer.

The matrix separates 22 source-defined active/current/open/licensed or directory-membership sources, seven non-active directory/registration/reporting cohorts, and one annual aggregate. Eleven of 51 state/DC jurisdictions have a broad source-defined-active class, leaving 40 without even that class. All 51 remain gaps for verified-current complete business coverage; `active_business_count` and `completeness_percentage` are intentionally null.

Every row binds its retained source release, source-view evidence counts, temporal interval when supplied, cohort and jurisdiction scope, and the applicable policy file/hash. `current_operations_verified` and `complete_all_businesses` are always false. Evidence-unit counts must never be relabeled as active-business counts.

The initial release `national-business-temporal-claim-matrix-a57c671154ebee1b5eb6f9ae6fec868660efa10527ec4ad1bec5d22843a8fb42` (manifest SHA-256 `654972675d41b28984a671a3e1c56e67736ff4d0a792958a0ca93042fc95674f`) remains retained and unselected. The hardened successor `national-business-temporal-claim-matrix-a89e9695adb1cc724df5c581bfa80e8ea29e1732025c2c0f187e3cf5376b3a4b` (manifest SHA-256 `f45787b30a3ce047c7550147b8c4c8f46766cf0de0ab198a21433725b744f3eb`) adds stable canonical input reads and binds the existing Los Angeles source policy; it is selected for local review without creating a pointer.

Successor `national-business-temporal-claim-matrix-fe35e8389e88d8094289b682ddfe08330d53d8891d34801f87cd24b505a1e9bd` has manifest SHA-256 `e60cca03203f8eaa02354cb46582f18de31c0fc9d1fde39b69e99bf84c085890`. It pins the exact 30-entry source/profile/release semantic roster and enforces canonical timestamp bounds against the retained coverage release and manifest filesystem time.

The final selected ownership-hardened successor is `national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090`, manifest SHA-256 `342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05`, created at `2026-10-03T07:04:32.887Z`. It adds canonical directory/reparse enforcement, explicit lock/staging device-and-inode ownership, cooperative read/write/rename cancellation boundaries, and primary-error-preserving cleanup. Earlier releases remain retained and unselected.

Build with `npm run business-temporal-claims:build`; verify with `npm run business-temporal-claims:verify -- --manifest <path>`. The builder uses invocation-time UTC only and supports cooperative cancellation, exclusive local build ownership, and owned staging cleanup.
