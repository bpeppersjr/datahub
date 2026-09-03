#!/usr/bin/env node

import process from "node:process";

import { createBusinessCoverageViewStore } from "../runner/business-coverage-view-store.mjs";

function usage() {
  return `Audit temporal evidence for every source in the current business coverage release.

Usage:
  node scripts/audit-business-source-temporal-status.mjs [options]

Options:
  --as-of <ISO instant>   Reproducible assessment time (default: current time)
  --summary-only          Omit source rows that are within their review window
  --allow-review-due      Exit zero when review-due or incomplete temporal evidence exists
  --help                  Show this help

This command is read-only. Review thresholds are internal controls, not publisher SLAs or proof of current business operation.
`;
}

function parseArguments(arguments_) {
  const result = { asOf: new Date(), summaryOnly: false, allowReviewDue: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (argument === "--summary-only") result.summaryOnly = true;
    else if (argument === "--allow-review-due") result.allowReviewDue = true;
    else if (argument === "--as-of") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--as-of requires an ISO instant.");
      result.asOf = new Date(value);
      if (!Number.isFinite(result.asOf.getTime()) || result.asOf.toISOString() !== value) throw new Error("--as-of must be an exact ISO instant.");
      index += 1;
    } else throw new Error(`Unknown argument ${argument}.`);
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
    const store = createBusinessCoverageViewStore({ now: () => options.asOf });
    const overview = await store.getOverview();
    if (!overview.available) throw new Error("No current business coverage release is available.");
    const sources = overview.sources.map((source) => ({
      source_key: source.source_key,
      source_name: source.source_name,
      source_release_id: source.release_metadata?.source_release_id ?? null,
      profile_count: source.profile_count,
      zip_rows_with_contribution: source.zip_rows_with_contribution,
      temporal_status: source.temporal_status,
    })).filter((source) => !options.summaryOnly || source.temporal_status.status !== "within-review-window");
    const report = {
      schema_version: "1.0.0",
      audit_mode: "read-only",
      as_of: options.asOf.toISOString(),
      coverage_release_id: overview.release_id,
      complete_all_businesses: overview.complete_all_businesses,
      source_temporal_summary: overview.source_temporal_summary,
      sources,
      claim_boundary: {
        review_window_is_publisher_sla: false,
        within_review_window_proves_current_business_operation: false,
        legal_or_program_status_equals_general_business_operation: false,
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    const summary = overview.source_temporal_summary;
    const needsReview = summary.review_due + summary.missing_source_reference
      + summary.future_source_reference + summary.unconfigured_source_policy;
    if (needsReview > 0 && !options.allowReviewDue) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Business source temporal audit failed: ${error.message}\n`);
  process.exitCode = 1;
}
