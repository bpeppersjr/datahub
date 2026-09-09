import { setImmediate as yieldLoop } from 'node:timers/promises';

export const IA_CHILDCARE_SELECTION_VERSION = 'ia-childcare-selection@1.0.0';
export const IA_CHILDCARE_SELECTION_FIELDS = Object.freeze(['businessType','businessName','address','city','zipCode','latitude','longitude','referral']);
const FIELDS = IA_CHILDCARE_SELECTION_FIELDS;
const COUNT_FIELDS = ['source_rows','selected_rows','excluded_rows','duplicate_selected_rows'];
const MAX_BYTES = 5000000;
const fail = () => { throw new Error('Iowa childcare selection rejected.'); };
const check = condition => { if (!condition) fail(); };
const abort = signal => { if (signal?.aborted) fail(); };
function dataObject(value, expected) {
  check(value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)));
  const keys = Reflect.ownKeys(value);
  check(keys.length <= 128 && keys.every(key => typeof key === 'string'));
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(keys.every(key => Object.hasOwn(descriptors[key],'value') && descriptors[key].enumerable));
  if (expected) check(keys.length === expected.length && keys.every(key => expected.includes(key)));
  return descriptors;
}
function signalOption(value) {
  const descriptors = dataObject(value);
  check(Object.keys(descriptors).every(key => key === 'signal'));
  const signal = descriptors.signal?.value;
  check(signal === undefined || signal instanceof AbortSignal); abort(signal); return signal;
}
function arraySnapshot(value) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= 10000);
  const keys = Reflect.ownKeys(value);
  check(keys.length === value.length + 1);
  const output = [];
  for (let index=0;index<value.length;index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value,String(index));
    check(descriptor && Object.hasOwn(descriptor,'value') && descriptor.enumerable); output.push(descriptor.value);
  }
  return output;
}
function sourceSnapshot(descriptors, replay) {
  const source = {};
  if (replay) check(Object.keys(descriptors).length === FIELDS.length && FIELDS.every(key => Object.hasOwn(descriptors,key)));
  for (const key of FIELDS) {
    const value = Object.hasOwn(descriptors,key) ? descriptors[key].value : null;
    if (value !== null) {
      if (key === 'referral') check(typeof value === 'boolean');
      // The observed contract uses numeric ZIPs and points. Negative zero is unsupported:
      // JSON serialization changes it to zero, so accepting it would not preserve exact source values.
      else if (key === 'latitude' || key === 'longitude' || key === 'zipCode') check(typeof value === 'number' && Number.isFinite(value) && !Object.is(value,-0));
      else check(typeof value === 'string' && value.length <= 2000);
    }
    source[key] = value;
  }
  check(source.businessType === 'building'); return source;
}
function boundedRows(rows) {
  // Include framing and the largest possible counts before allocating a complete serialized selection.
  let size = 160;
  for (const row of rows) { size += Buffer.byteLength(JSON.stringify(row),'utf8') + 1; check(size <= MAX_BYTES); }
}
async function finalize(rows, sourceRows, signal, expectedCounts) {
  const seen = new Set(); let duplicateRows=0, previousOrdinal=0;
  for (let index=0;index<rows.length;index++) {
    if (index % 256 === 0) { await yieldLoop(); abort(signal); }
    const row = rows[index];
    check(Number.isSafeInteger(row.source_ordinal) && row.source_ordinal > previousOrdinal && row.source_ordinal <= sourceRows);
    previousOrdinal = row.source_ordinal;
    const fingerprint = JSON.stringify(FIELDS.map(key => [typeof row.source[key],row.source[key]]));
    if (seen.has(fingerprint)) duplicateRows++; else seen.add(fingerprint);
  }
  const counts = { source_rows:sourceRows, selected_rows:rows.length, excluded_rows:sourceRows-rows.length, duplicate_selected_rows:duplicateRows };
  if (expectedCounts) check(COUNT_FIELDS.every(key => counts[key] === expectedCounts[key]));
  const result = {rows,counts}; check(Buffer.byteLength(JSON.stringify(result),'utf8') <= MAX_BYTES); abort(signal); return result;
}
/** Projection only. Ordinals identify positions in one release, not stable provider identities. */
export async function selectIaChildcareRows(payload, options={}) {
  try {
    const signal=signalOption(options), input=arraySnapshot(payload), rows=[];
    // Snapshot selected primitives before yielding: caller mutations cannot change an in-flight selection.
    let retainedBytes=160;
    for (let index=0;index<input.length;index++) {
      const descriptors=dataObject(input[index]);
      if (descriptors.businessType?.value !== 'building') continue;
      const row={source_ordinal:index+1,source:sourceSnapshot(descriptors,false)};
      retainedBytes += Buffer.byteLength(JSON.stringify(row),'utf8')+1; check(retainedBytes<=MAX_BYTES); rows.push(row);
    }
    return await finalize(rows,input.length,signal);
  } catch { fail(); }
}
/** Shape/conservation replay only; excluded source membership and source authenticity require origin evidence. */
export async function validateIaChildcareSelection(selection, options={}) {
  try {
    const signal=signalOption(options), top=dataObject(selection,['rows','counts']);
    const countDescriptors=dataObject(top.counts.value,COUNT_FIELDS), expectedCounts={};
    for(const key of COUNT_FIELDS) {
      const value=countDescriptors[key].value;
      check(Number.isSafeInteger(value) && value>=0 && value<=10000 && !Object.is(value,-0)); expectedCounts[key]=value;
    }
    const rows=arraySnapshot(top.rows.value).map(value=>{
      const row=dataObject(value,['source_ordinal','source']);
      return {source_ordinal:row.source_ordinal.value,source:sourceSnapshot(dataObject(row.source.value,FIELDS),true)};
    });
    boundedRows(rows);
    return await finalize(rows,expectedCounts.source_rows,signal,expectedCounts);
  } catch { fail(); }
}
