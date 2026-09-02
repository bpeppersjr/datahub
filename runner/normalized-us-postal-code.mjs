function isObject(value) {
  return value !== null && typeof value === "object";
}

function fieldPath(base, field) {
  return base ? `${base}.${field}` : field;
}

export function assertNormalizedUsPostalFields(address, path = "address") {
  if (!isObject(address) || Array.isArray(address)) throw new TypeError(`${path} must be an object.`);
  for (const field of ["zip_code", "postal_code", "zip4"]) {
    if (!Object.hasOwn(address, field)) throw new Error(`${fieldPath(path, field)} is required by the normalized U.S. postal contract.`);
  }

  const { zip_code: zipCode, postal_code: postalCode, zip4 } = address;
  if (zipCode === null) {
    if (postalCode !== null || zip4 !== null) throw new Error(`${path} must keep postal_code and zip4 null when zip_code is null.`);
    return address;
  }
  if (!/^\d{5}$/.test(zipCode)) throw new Error(`${fieldPath(path, "zip_code")} must contain exactly ZIP5.`);
  if (postalCode !== zipCode) throw new Error(`${fieldPath(path, "postal_code")} must equal the normalized ZIP5 and must not contain ZIP+4.`);
  if (zip4 !== null && !/^\d{4}$/.test(zip4)) throw new Error(`${fieldPath(path, "zip4")} must contain exactly four digits or null.`);
  return address;
}

export function assertNormalizedUsPostalFieldsDeep(value, path = "record") {
  if (!isObject(value)) return value;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNormalizedUsPostalFieldsDeep(item, `${path}[${index}]`));
    return value;
  }

  const carriesPostalAliasOrExtension = Object.hasOwn(value, "postal_code") || Object.hasOwn(value, "zip4");
  const isMarkedUsAddressWithZip = Object.hasOwn(value, "zip_code") && value.country === "US";
  if (carriesPostalAliasOrExtension || isMarkedUsAddressWithZip) assertNormalizedUsPostalFields(value, path);
  for (const [key, item] of Object.entries(value)) assertNormalizedUsPostalFieldsDeep(item, fieldPath(path, key));
  return value;
}
