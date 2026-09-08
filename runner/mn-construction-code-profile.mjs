const COLUMN_COUNT = 18;
const check = (v, why) => { if (!v) throw new Error(`Minnesota code profile rejected: ${why}.`); };
const markers = ["Business", "Person", "B", "P", "Individual"];
const prefixes = ["IR", "BC", "CR", "RR", "MI", "QB", "QC", "QR", "QI"];
const statuses = ["Issued", "Expired", "Revoked", "Suspended", "Cancelled", "Canceled", "Pending", "Inactive", "Denied", "Withdrawn"];
const empty = (values) => Object.fromEntries([...values, "unknown", "blank"].map((v) => [v, 0]));

/** Fixed-prefix diagnostic only. Unselected field values are never accumulated.
 * Unknown codes are counted without retaining their text or hashes. Complete
 * selected values are discarded after incrementing finite, predeclared buckets.
 */
export function profileMnConstructionCodes(prefix, header) {
  // The transport validates the exact pinned header before invoking this helper.
  check(Buffer.isBuffer(prefix) && prefix.length <= 4096 && prefix.indexOf(10) > 0 && header?.header_bytes === prefix.indexOf(10) + 1 && header.columns?.length === COLUMN_COUNT, "validated header boundary");
  const result = { complete_records_examined: 0, incomplete_tail_discarded: false, business_person: empty(markers), credential_prefix: empty(prefixes), status: empty(statuses),
    counts_independently_replayed: false, scope: "Nonrepresentative first-prefix code counts only; no names, addresses, contacts, full identifiers or source rows retained." };
  let fieldIndex = 0, value = "", quoted = false, closed = false, fieldStarted = false, recordStarted = false, selected = {}, selectedInvalid = false;
  const keep = () => [0, 12, 13].includes(fieldIndex);
  function append(c) {
    if (c >= 128 || value.length >= 100) selectedInvalid = true;
    else value += String.fromCharCode(c);
  }
  function field() { if (keep()) selected[fieldIndex] = value; value = ""; fieldIndex++; closed = false; fieldStarted = false; }
  const bucket = (v, allowed) => v === "" ? "blank" : allowed.includes(v) ? v : "unknown";
  function record() {
    field(); check(fieldIndex === COLUMN_COUNT, "row width");
    check(!selectedInvalid, "selected code encoding or size");
    result.complete_records_examined++; check(result.complete_records_examined <= 200, "record ceiling");
    result.business_person[bucket(selected[0], markers)]++;
    const id = selected[12], p = /^[A-Z]{2}\d{6}$/.test(id) ? id.slice(0, 2) : id === "" ? "" : "unknown";
    result.credential_prefix[bucket(p, prefixes)]++; result.status[bucket(selected[13], statuses)]++;
    selected = {}; fieldIndex = 0; recordStarted = false; selectedInvalid = false;
  }
  // Byte-level CSV framing preserves quoted newlines and avoids decoding a
  // partially received UTF-8 character in the discarded final record.
  for (let i = header.header_bytes; i < prefix.length; i++) {
    const c = prefix[i]; recordStarted = true;
    if (quoted) {
      if (c === 34) { if (prefix[i + 1] === 34) { if (keep()) append(34); i++; } else { quoted = false; closed = true; } }
      else if (keep()) append(c);
    } else if (c === 44) field();
    else if (c === 10 || c === 13) {
      if (c === 13) { if (i + 1 === prefix.length) break; check(prefix[i + 1] === 10, "line ending"); i++; }
      record();
    } else if (c === 34) { check(!fieldStarted && !closed, "quoting"); quoted = true; fieldStarted = true; }
    else { check(!closed, "quoting"); fieldStarted = true; if (keep()) append(c); }
    check(fieldIndex < COLUMN_COUNT, "row width");
  }
  result.incomplete_tail_discarded = recordStarted;
  validateMnConstructionCodeProfile(result); return result;
}
export function validateMnConstructionCodeProfile(value) {
  const expected = ["complete_records_examined", "incomplete_tail_discarded", "business_person", "credential_prefix", "status", "counts_independently_replayed", "scope"];
  check(value && Object.keys(value).length === expected.length && expected.every((k) => Object.hasOwn(value, k)), "profile fields");
  check(Number.isSafeInteger(value.complete_records_examined) && value.complete_records_examined >= 0 && value.complete_records_examined <= 200 && typeof value.incomplete_tail_discarded === "boolean", "profile counts");
  for (const [key, allowed] of [["business_person", markers], ["credential_prefix", prefixes], ["status", statuses]]) {
    const v = value[key], keys = Object.keys(empty(allowed));
    check(v && Object.keys(v).length === keys.length && keys.every((k) => Number.isSafeInteger(v[k]) && v[k] >= 0) && Object.values(v).reduce((a, b) => a + b, 0) === value.complete_records_examined, "bucket conservation");
  }
  check(value.counts_independently_replayed === false && value.scope === "Nonrepresentative first-prefix code counts only; no names, addresses, contacts, full identifiers or source rows retained.", "profile claims");
  return value;
}
