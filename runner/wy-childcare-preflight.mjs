import path from "node:path";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const check = (value, message) => { if (!value) throw Error(`Wyoming childcare metadata preflight rejected: ${message}.`); };
const inside = (root, value) => { const relative = path.relative(root, value); check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "path"); };

export async function verifyWyChildcarePreflight(manifestPath, { appRoot = APP_ROOT } = {}) {
  const root = await realpath(appRoot), file = await realpath(manifestPath); inside(root, file);
  check(path.basename(file) === "manifest.json", "manifest path");
  const dir = path.dirname(file), files = (await readdir(dir)).sort();
  check(files.join("|") === "manifest.json|receipt.json", "inventory");
  const manifestBytes = await readFile(file), manifest = JSON.parse(manifestBytes);
  check(manifest.schema_version === "wy-childcare-metadata-preflight-manifest@1.0.0" && manifest.run_id === "wy-childcare-preflight-20261007-175437" && manifest.status === "immutable-metadata-only-zero-provider-rows" && manifest.claims?.network_requests === 3 && manifest.claims.pdf_body_requested === false && manifest.claims.provider_rows_acquired === 0 && manifest.claims.production_admission === false && manifest.claims.current_pointer_written === false, "manifest contract");
  const receiptFile = await realpath(path.join(dir, manifest.receipt.path)); inside(dir, receiptFile);
  const info = await lstat(receiptFile), receiptBytes = await readFile(receiptFile);
  check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && receiptBytes.length === manifest.receipt.bytes && sha(receiptBytes) === manifest.receipt.sha256, "receipt identity");
  const receipt = JSON.parse(receiptBytes);
  check(receipt.schema_version === "wy-childcare-metadata-preflight@1.0.0" && receipt.status === "official-monthly-active-provider-pdf-metadata-validated-zero-provider-rows" && receipt.current_file?.file_id === "1wikI4MQYcdBfvZr4s5-XRXrqIPuH0XIQ" && receipt.current_file.filename === "Oct 2026 Active Provider.pdf" && receipt.current_file.content_length === 281722 && receipt.current_file.last_modified === "Tue, 06 Oct 2026 17:35:32 GMT" && receipt.statistics_page?.licensed_provider_count === 492 && receipt.statistics_page.exempt_provider_count === 124 && receipt.requests?.length === 3 && receipt.requests.every((item) => item.provider_rows_returned === 0) && receipt.claims?.pdf_body_requested === false && receipt.claims.provider_rows_acquired === 0 && receipt.claims.production_admission === false, "receipt contract");
  return { verified: true, manifest_sha256: sha(manifestBytes), run_id: manifest.run_id, status: receipt.status, current_file: structuredClone(receipt.current_file), claims: structuredClone(receipt.claims) };
}
