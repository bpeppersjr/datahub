import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import { verifyNationalBusinessTemporalLifecycleReconciliation as prior } from "./national-business-temporal-lifecycle-reconciliation.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  fail = (m) => {
    throw Error("Temporal lifecycle v1.1 rejected: " + m);
  },
  ck = (v, m) => {
    if (!v) fail(m);
  };
async function read(root, relative) {
  ck(
    typeof relative === "string" &&
      !path.isAbsolute(relative) &&
      !relative.includes("\\") &&
      !relative.split("/").includes(".."),
    "path",
  );
  const file = path.join(root, relative),
    h = await fs.open(file, "r");
  try {
    const a = await h.stat({ bigint: true });
    ck(a.isFile() && a.nlink === 1n, "file");
    const b = await h.readFile(),
      z = await h.stat({ bigint: true }),
      n = await fs.lstat(file, { bigint: true });
    ck(
      !n.isSymbolicLink() &&
        ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(
          (k) => a[k] === z[k] && a[k] === n[k],
        ),
      "mutation",
    );
    return { value: JSON.parse(b), sha256: sha(b) };
  } finally {
    await h.close();
  }
}
export async function verifyNationalBusinessTemporalLifecycleReconciliationV11({
  root = APP_ROOT,
  signal,
} = {}) {
  root = path.resolve(root);
  signal?.throwIfAborted();
  const reg = await read(
      root,
      "config/datasets/national-business-temporal-lifecycle-reconciliation-v1-1.json",
    ),
    c = reg.value,
    b = c.bindings,
    e = c.expected;
  ck(
    c.schema_version === "1.1.0" &&
      c.dataset_id ===
        "national-business-temporal-lifecycle-reconciliation-v1-1" &&
      c.runtime_pointer === null &&
      c.production_enrollment === false,
    "registration",
  );
  const [p, base, ptr, man] = await Promise.all([
    prior({ root, signal }),
    read(root, b.reconciliation_registration.path),
    read(root, b.la_pointer.path),
    read(root, b.la_manifest.path),
  ]);
  ck(
    base.sha256 === b.reconciliation_registration.sha256 &&
      ptr.sha256 === b.la_pointer.sha256 &&
      man.sha256 === b.la_manifest.sha256,
    "pin",
  );
  ck(
    ptr.value.release_id === man.value.release_id &&
      man.value.dataset_id === "la-active-business-location-accounts",
    "LA identity",
  );
  const source = man.value.artifacts.find(
      (x) => x.path === b.source_artifact.path,
    ),
    summaryDescriptor = man.value.artifacts.find(
      (x) => x.path === b.source_summary.path,
    );
  ck(
    source?.sha256 === b.source_artifact.sha256 &&
      source.record_count === e.source_rows &&
      summaryDescriptor?.sha256 === b.source_summary.sha256,
    "artifact descriptor",
  );
  const summary = await read(
    root,
    path.posix.join(
      path.posix.dirname(b.la_manifest.path),
      b.source_summary.path,
    ),
  );
  ck(summary.sha256 === b.source_summary.sha256, "summary pin");
  const s = summary.value;
  ck(
    s.source_location_accounts === e.source_rows &&
      s.normalized_us_location_accounts === e.normalized_profiles &&
      s.quarantined_source_records === e.quarantined_rows &&
      e.source_rows === e.normalized_profiles + e.quarantined_rows,
    "row conservation",
  );
  ck(
    s.quarantine_reasons["invalid-or-unmapped-us-zip"] ===
      e.invalid_or_unmapped_zip &&
      s.quarantine_reasons["missing-business-location-address"] ===
        e.missing_address &&
      e.quarantined_rows === e.invalid_or_unmapped_zip + e.missing_address,
    "quarantine conservation",
  );
  ck(
    p.summary.mismatch_profiles === e.normalized_profiles &&
    Object.entries(e.effective_counts).every(
      ([key, value]) => p.summary.effective_classification_counts[key] === value,
    ) &&
      p.mismatch.lifecycle_evidence === "unknown",
    "lifecycle conservation",
  );
  const claims = c.claims;
  ck(
    claims.publisher_cohort_assertion ===
      "active-list-membership-without-row-status" &&
      claims.lifecycle_evidence === "unknown" &&
      claims.active_business_eligible_count === 0 &&
      claims.current_operations_verified === false &&
      claims.active_business_count === null &&
      claims.completeness_percentage === null &&
      claims.network_requests === 0 &&
      claims.pointer_mutation_performed === false &&
      claims.production_enrollment === false,
    "claims",
  );
  return {
    schema_version: "national-business-temporal-lifecycle-reconciliation@1.1.0",
    verified: true,
    status: "publisher-cohort-assertion-with-null-row-status",
    registration: {
      path: "config/datasets/national-business-temporal-lifecycle-reconciliation-v1-1.json",
      sha256: reg.sha256,
    },
    summary: {
      source_rows: e.source_rows,
      normalized_profiles: e.normalized_profiles,
      quarantined_rows: e.quarantined_rows,
      quarantine_reasons: {
        invalid_or_unmapped_zip: e.invalid_or_unmapped_zip,
        missing_address: e.missing_address,
      },
      effective_classification_counts: e.effective_counts,
    },
    publisher_membership: {
      source_key: "la_active_business_location_accounts",
      profile_source_id: "los-angeles-office-of-finance-active-businesses",
      assertion: claims.publisher_cohort_assertion,
      profile_count: e.normalized_profiles,
      row_status: "null",
      lifecycle_evidence: "unknown",
    },
    provenance: {
      la_pointer_sha256: ptr.sha256,
      la_manifest_sha256: man.sha256,
      source_artifact_sha256: source.sha256,
      source_summary_sha256: summary.sha256,
      prior_reconciliation_registration_sha256: base.sha256,
    },
    claims,
  };
}
