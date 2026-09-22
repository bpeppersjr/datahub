# Retained business-source refresh readiness

Colorado, Connecticut, Delaware, Florida, and Pennsylvania use one descriptor-driven, read-only readiness service. It binds policy, connector, dataset catalog, reviewed assessment, current pointer, and current manifest bytes before reporting a plan.

The service does not contact a publisher, allocate an operation, write a receipt, or change a pointer. Preview plans always report zero network requests and zero allocations. A start request first repeats the evidence validation and then returns `ACQUISITION_NOT_AUTHORIZED`; corrupt or drifted evidence therefore fails closed before the policy rejection.

Each descriptor retains its source-specific completeness flag, count reconciliation, artifact roster, temporal field, semantic steps, and display metrics. Shared code handles safe file reads, hashing, pointer binding, authorization checks, evidence projection, and plan identity. Registration and license records remain organization evidence rather than claims of present operation or verified sites.

Fresh acquisition and production promotion require separate reviewed authority and are outside this readiness service.
