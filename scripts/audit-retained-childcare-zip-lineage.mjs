import { auditRetainedChildcareZipLineage } from "../runner/retained-childcare-zip-lineage-audit.mjs";

if (process.argv.length !== 2) throw new Error("This audit accepts no arguments.");
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
process.stdout.write(`${JSON.stringify(await auditRetainedChildcareZipLineage({ signal: controller.signal }), null, 2)}\n`);
