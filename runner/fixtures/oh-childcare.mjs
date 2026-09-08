import { OH_LAYER, OH_ITEM, OH_SOURCE_WKT, ohioPreflightUrl } from "../oh-childcare-preflight.mjs";

// Synthetic metadata only: no provider rows or copied contact/notice contents.
export function ohioPayload(kind) {
  if (kind === "selected") return { count: 4237 };
  if (kind === "centers") return { count: 4344 };
  if (kind === "statuses") return { features: [["Enforcement", 5], ["Inactive", 102], ["Open", 4237]].map(([program_status, source_count]) => ({ attributes: { program_status, source_count } })), exceededTransferLimit: false, objectIdFieldName: "objectid", fields: [{ name: "source_count", type: "esriFieldTypeInteger" }, { name: "program_status", type: "esriFieldTypeString", length: 8000 }] };
  if (kind === "item") return { id: OH_ITEM, owner: "oitogrip", orgId: "0123456789ABCDEF", access: "public", type: "Feature Service", title: "Ohio Daycare Centers", url: OH_LAYER.slice(0, -2), created: 1758887286916, modified: 1763476253479, description: "Synthetic Step Up To Quality scope", licenseInfo: "Synthetic public use informational purposes only warrant liability notice", accessInformation: null, privateUrl: "DO-NOT-RETAIN" };
  if (kind !== "layer") throw new Error("Unknown fixture kind");
  const strings = "county program_type program_name street_address city state zip_code mailing_address mailing_address_2 mailing_city mailing_state mailing_zip_code program_status phone_number sutq_rating program_email_address link geocode_status matchaddress addr_type loc_name".split(" ");
  const doubles = "program_number geocode__latitude_ geocode__longitude_ geocode_score x y".split(" ");
  return { id: 0, name: "Ohio_Daycares", type: "Feature Layer", serviceItemId: OH_ITEM, geometryType: "esriGeometryPoint", objectIdField: "objectid", capabilities: "Query", maxRecordCount: 1000, hasMetadata: true, description: "", copyrightText: "", editingInfo: {},
    fields: [{ name: "objectid", type: "esriFieldTypeOID", length: 4, nullable: false, defaultValue: null, domain: null }, ...strings.map((name) => ({ name, type: "esriFieldTypeString", length: 8000, nullable: true, defaultValue: null, domain: null })), ...doubles.map((name) => ({ name, type: "esriFieldTypeDouble", nullable: true, defaultValue: null, domain: null }))],
    sourceSpatialReference: { wkid: 3857, wkt: OH_SOURCE_WKT }, extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, advancedQueryCapabilities: { supportsPagination: true, supportsStatistics: true, supportsOrderBy: true } };
}
export function ohioFixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: { now: () => new Date("2026-09-08T05:00:00.000Z"), sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); }, fetchImpl: async (url, options) => {
    calls.push({ url, options }); const kind = ["layer", "item", "statuses", "centers", "selected"].find((k) => ohioPreflightUrl(k) === url);
    const value = ohioPayload(kind), changed = change(value, kind, calls.length) ?? value;
    return changed instanceof Response ? changed : Response.json(changed);
  } } };
}
