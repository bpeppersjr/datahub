// A collection supervisor must outlive its source worker's cooperative cleanup.
// Delaware's two commit rename retry schedules total 44,700 ms; OS I/O and
// process stalls are not bounded by these grace periods.
export const COLLECTION_CHILD_CANCEL_GRACE_MS = 60_000;
export const COLLECTION_SUPERVISOR_CANCEL_GRACE_MS = 75_000;
export const EXPORT_CANCEL_GRACE_MS = 15_000;
export const COLLECTION_CANCEL_WARNING = "Cancellation requested; completed or partially published output may exist. Inspect task receipts and retained artifacts before retrying.";
