import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildOkBusinessBulkOffline, readOkBusinessBulkPackage } from "./ok-business-bulk-offline.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const types = Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(2, "0"));
const fields = { "01":23,"02":9,"03":12,"04":14,"05":14,"06":12,"07":7,"08":7,"09":3,"10":3,"11":3,"12":3,"13":3,"14":3,"15":3,"16":3,"17":10,"18":9 };
const line = (type, values = {}) => Array.from({ length: fields[type] }, (_, index) => values[index] ?? (index === 0 ? type : "")).join("~");

async function fixture({ badTrailer = false, includePerson = true, oversizedName = false } = {}) {
  const id = `test-${randomUUID()}`, directory = path.join(APP_ROOT, "data", "imports", "oklahoma-business-bulk", "packages", id), output = path.join(APP_ROOT, "tmp", `ok-bulk-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const rows = [
    line("01", {1:"1234567890",2:"A",3:"LL",4:"ADDR1",5:oversizedName ? "X".repeat(151) : "TEST ORGANIZATION",8:"20200101",10:"20200101"}),
    line("02", {1:"ADDR1",2:"100 MAIN ST",4:"OKLAHOMA CITY",5:"OK",6:"73102",7:"1234",8:"US"}),
    ...(includePerson ? [line("03", {1:"1234567890",3:"PERSON NAME"}), line("04", {1:"1234567890",5:"PRIVATE PERSON"})] : []),
    line("11", {1:"A",2:"ACTIVE"}), line("12", {1:"LL",2:"LIMITED LIABILITY COMPANY"}),
  ];
  const counts = Object.fromEntries(types.map(type => [type, rows.filter(row => row.startsWith(`${type}~`)).length]));
  const trailer = ["99", "9999999999", "20261003", ...types.map(type => String(counts[type] + (badTrailer && type === "01" ? 1 : 0)))].join("~");
  const bytes = Buffer.from(`${rows.join("\n")}\n${trailer}\n`);
  await writeFile(path.join(directory, "business-bulk.txt"), bytes);
  const selection = { schema_version:"ok-business-bulk-selection@1.0.0", package_id:id, observed_at:"2026-10-03T00:00:00.000Z", source_file:"business-bulk.txt", source_sha256:digest(bytes), authorization:{operator_supplied:true,network_acquisition_authorized:false,purchase_authorized:false,production_admission_authorized:false,source_pointer_change_authorized:false} };
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify(selection)}\n`);
  return { directory, selectionPath:path.join(directory,"selection.json"), output, cleanup:async()=>{await rm(directory,{recursive:true,force:true});await rm(output,{recursive:true,force:true});} };
}

test("validates trailer controls and projects only organization/address evidence", async () => {
  const f = await fixture();
  try {
    const receipt = await buildOkBusinessBulkOffline({ selectionPath:f.selectionPath, outputDirectory:f.output });
    assert.equal(receipt.projected_organization_count, 1); assert.equal(receipt.network_requests, 0); assert.equal(receipt.national_admission_performed, false);
    const row = JSON.parse((await readFile(path.join(f.output,"organizations.jsonl"),"utf8")).trim());
    assert.equal(row.organization_name,"TEST ORGANIZATION"); assert.equal(row.administrative_address.zip5,"73102"); assert.equal(row.administrative_address.zip4,"1234");
    const serialized = JSON.stringify(row); assert.doesNotMatch(serialized,/PERSON NAME|PRIVATE PERSON|agent|officer|phone|tax/i);
  } finally { await f.cleanup(); }
});

test("rejects a mismatched trailer count", async () => {
  const f = await fixture({ badTrailer:true });
  try { await assert.rejects(readOkBusinessBulkPackage(f.selectionPath), /trailer count for record 01/); }
  finally { await f.cleanup(); }
});

test("rejects extra package files", async () => {
  const f = await fixture();
  try { await writeFile(path.join(f.directory,"extra.txt"),"x"); await assert.rejects(readOkBusinessBulkPackage(f.selectionPath), /exactly selection/); }
  finally { await f.cleanup(); }
});

test("rejects a field beyond the official published width", async () => {
  const f = await fixture({ oversizedName:true });
  try { await assert.rejects(readOkBusinessBulkPackage(f.selectionPath), /exceeds published width/); }
  finally { await f.cleanup(); }
});
