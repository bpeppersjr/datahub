import { FIFTY_STATES_AND_DC } from './business-state-source-readiness.mjs';

const states = new Set(FIFTY_STATES_AND_DC);
const noticeFields = Object.freeze(['denialSent', 'revocationSent', 'emergencyIssued']);
const safeString = value => typeof value === 'string' && value.length <= 1000
  && !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.from(value, 'utf8').toString('utf8') === value;

// Only the observed two-line grammar is recognized. Source text is never evaluated or repaired.
export function parseOkChildcareAddressLines(value) {
  const result = { source_lines: null, parsed: false, reason: 'invalid-address-lines-shape', street: null, city: null,
    state: null, zip_code: null, postal_code: null, zip4: null,
    address_role: 'reported-address-role-unspecified', address_role_verified: false };
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return result;
  const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 10
    || Reflect.ownKeys(descriptors).length !== length + 1) return result;
  const lines = [];
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !safeString(descriptor.value)) return result;
    lines.push(descriptor.value);
  }
  result.source_lines = lines;
  result.reason = 'address-parsing-unresolved';
  if (lines.length !== 2 || !lines[0].trim()) return result;
  const match = /^([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-(\d{4}))?$/.exec(lines[1]);
  if (!match || !match[1].trim() || !states.has(match[2]) || match[3] === '00000') return result;
  return { ...result, parsed: true, reason: null, street: lines[0].trim(), city: match[1].trim(), state: match[2],
    zip_code: match[3], postal_code: match[3], zip4: match[4] ?? null };
}

// Notice presence is not evidence that a program is closed, and absence is not proof it operates.
export function interpretOkChildcareNoticeFlags(input) {
  const plain = input !== null && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype;
  const flags = {}, unknown = [];
  for (const field of noticeFields) {
    const descriptor = plain ? Object.getOwnPropertyDescriptor(input, field) : undefined;
    const value = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    flags[field] = value === 'True' ? true : value === 'False' ? false : null;
    if (flags[field] === null) unknown.push(field);
  }
  return { flags, unknown_fields: unknown, status_interpretation: 'operating-status-not-provided-by-selected-source', active_business_verified: false };
}
