import path from "node:path";
import { verifyRetainedChildcareZipEvidenceSuccessor } from "../runner/retained-childcare-zip-evidence.mjs";

const args = process.argv.slice(2);
if (args.length !== 1) throw new Error("Usage: <manifest.json>");
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
process.stdout.write(`${JSON.stringify(await verifyRetainedChildcareZipEvidenceSuccessor(path.resolve(args[0]), { signal: controller.signal }), null, 2)}\n`);
