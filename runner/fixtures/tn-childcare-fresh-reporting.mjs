import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "../paths.mjs";
import { createTnChildcareFixture } from "./tn-childcare-fetch.mjs";
import { buildTnChildcareRelease } from "../tn-childcare-release.mjs";
import { loadFreshTnChildcareReportingInput } from "../tn-childcare-fresh-reporting-input.mjs";

/** Synthetic transport through the real immutable release/verification pipeline; never publisher authenticity evidence. */
export async function createFreshTnReportingRows(context, { allMissing = false, zip = "12345-0123" } = {}) {
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-fresh-geography-fixture-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const transport = createTnChildcareFixture({ count: 3, mutate: (p, kind) => {
    if (kind !== "features") return;
    p.features[0].attributes.Zip = allMissing ? null : zip;
    p.features[1].attributes.Zip = null; p.features[1].attributes.Street_Address_2 = "Suite 200";
    p.features[2].attributes.Zip = "0"; p.features[2].geometry = null;
  } });
  const release = await buildTnChildcareRelease({ outputRoot: root, fetchImpl: transport.fetchImpl, sleep: async () => {}, now: () => new Date("2026-09-08T00:00:01.000Z") });
  return (await loadFreshTnChildcareReportingInput(release.manifest_path)).reportingRows;
}
