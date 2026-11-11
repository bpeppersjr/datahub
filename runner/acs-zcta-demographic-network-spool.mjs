import fs from "node:fs/promises";
import path from "node:path";
import {createHash, randomUUID} from "node:crypto";

export const VERSION = "acs-zcta-demographic-network-spool@1.0.0";
const fail = (message) => {
  throw new Error(`ACS ZCTA response spool rejected: ${message}.`);
};
const check = (value, message) => value || fail(message);
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const contained = (root, candidate) => {
  const resolved = path.resolve(candidate), relative = path.relative(root, resolved);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "contained path");
  return resolved;
};
const stable = (a, b) =>
  a.isDirectory() &&
  b.isDirectory() &&
  !a.isSymbolicLink() &&
  !b.isSymbolicLink() &&
  a.ino === b.ino &&
  a.dev === b.dev;

export async function spoolAcsJsonResponse({
  root,
  directory,
  filename,
  response,
  expectedUrl,
  maximumBytes,
  signal,
}) {
  check(typeof root === "string" && typeof directory === "string", "root and directory");
  check(/^(?:metadata|data)-B(?:01001|02001|03002|04006)\.json$/.test(filename ?? ""), "artifact filename");
  check(typeof expectedUrl === "string" && expectedUrl.startsWith("https://api.census.gov/"), "expected URL");
  check(safeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 536_870_912, "byte ceiling");
  signal?.throwIfAborted();
  const realRoot = await fs.realpath(path.resolve(root)), realDirectory = await fs.realpath(path.resolve(directory));
  contained(realRoot, realDirectory);
  const relative = path.relative(realRoot, realDirectory).replaceAll(path.sep, "/");
  check(/^data\/acs-zcta-demographic-network\/\.staging\/[A-Za-z0-9-]+$/.test(relative), "app-owned staging directory");
  const directoryIdentity = await fs.lstat(realDirectory, {bigint: true});
  check(directoryIdentity.isDirectory() && !directoryIdentity.isSymbolicLink(), "staging directory identity");
  check(response && response.status === 200 && response.ok === true, "HTTP status");
  check(response.url === expectedUrl, "final response URL");
  const contentType = response.headers?.get?.("content-type");
  check(typeof contentType === "string" && /^application\/json(?:\s*;|$)/i.test(contentType), "JSON content type");
  const lengthHeader = response.headers?.get?.("content-length"), encoding = response.headers?.get?.("content-encoding") ?? "identity";
  if (lengthHeader !== null && lengthHeader !== undefined && encoding === "identity") {
    check(/^\d+$/.test(lengthHeader), "content length syntax");
    check(Number(lengthHeader) <= maximumBytes, "declared content length ceiling");
  }
  check(response.body && typeof response.body[Symbol.asyncIterator] === "function", "streaming response body");
  const destination = contained(realRoot, path.join(realDirectory, filename));
  await fs.lstat(destination).then(() => fail("immutable destination exists"), (error) => {
    if (error.code !== "ENOENT") throw error;
  });
  const temporary = contained(realRoot, path.join(realDirectory, `.${filename}.${randomUUID()}.partial`));
  const handle = await fs.open(temporary, "wx"), hash = createHash("sha256");
  let bytes = 0, closed = false;
  try {
    for await (const value of response.body) {
      signal?.throwIfAborted();
      check(value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= 8_388_608, "response chunk");
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      bytes += chunk.length;
      check(bytes <= maximumBytes, "received byte ceiling");
      await handle.write(chunk);
      hash.update(chunk);
    }
    check(bytes > 0, "empty response body");
    signal?.throwIfAborted();
    await handle.sync(); await handle.close(); closed = true;
    check(stable(directoryIdentity, await fs.lstat(realDirectory, {bigint: true})), "staging directory changed");
    await fs.rename(temporary, destination);
    const final = await fs.lstat(destination, {bigint: true});
    check(final.isFile() && !final.isSymbolicLink() && final.nlink === 1n && final.size === BigInt(bytes), "published source artifact identity");
    return Object.freeze({
      schema_version: VERSION,
      path: filename,
      bytes,
      sha256: hash.digest("hex"),
      source_url: expectedUrl,
      content_type: contentType,
      source_transport_encoding: encoding,
      claims: Object.freeze({network_requests: 1, normalized: false, production_enrollment: false, current_pointer_written: false}),
    });
  } catch (error) {
    if (!closed) await handle.close().catch(() => {});
    await fs.rm(temporary, {force: true}).catch(() => {});
    throw error;
  }
}
