import { WI_LAYER, WI_LAYER_ITEM, WI_SERVICE_ITEM, WI_NOTICE_ITEM } from "../wi-childcare-preflight.mjs";

// Synthetic contract fixtures: no facility records, contacts or copied private metadata.
function layer() {
  const strings = { ProvderNumber: 50, LocationNumber: 12, FacilityNumber: 25, FacilityName: 255, LocationContactFullName: 255, LocationPrimaryPhoneNumber: 100, LocationLineAddress1: 100, LocationLineAddress2: 100, City: 100, State: 10, ZipCode: 25, CategoryType: 100, Months: 100, Hours: 100, FullTime: 25, FromAge: 100, ToAge: 100, StarLevel: 25 };
  return { id: 0, name: "Child_Care_Providers", type: "Feature Layer", serviceItemId: WI_SERVICE_ITEM, geometryType: "esriGeometryPoint", capabilities: "Map,Query,Data", maxRecordCount: 2000, hasMetadata: true,
    extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
    fields: [...Object.entries(strings).map(([name, length]) => ({ name, type: "esriFieldTypeString", length, domain: null })), ...Object.entries({ OBJECTID: "OID", Latitude: "Double", Longitude: "Double", Capacity: "Integer", Shape: "Geometry" }).map(([name, type]) => ({ name, type: `esriFieldType${type}`, domain: null }))] };
}
export function payload(url) {
  if (url.endsWith("/metadata")) return '<?xml version="1.0"?><metadata><name>Child_Care_Providers</name><title>Wisconsin Child Care Providers</title><credit>Wisconsin Department of Health Services</credit><crs>GCS_WGS_1984 WGS_1984_Web_Mercator_Auxiliary_Sphere</crs><identCode code="3857"/><useLimit>AS IS no warranty</useLimit></metadata>';
  if (url.includes("/iteminfo?")) return { title: "Wisconsin Child Care Providers", accessInformation: "Wisconsin Department of Health Services", licenseInfo: "AS IS no warranty legal, engineering or surveying" };
  if (url.includes(WI_NOTICE_ITEM)) {
    if (url.includes("/data?")) return { values: { sites: [{ id: "e7f90e89d76c4098b31dd589c0fe294a", title: "Wisconsin Department of Health Services Open Spatial Data Portal" }], updatedAt: "2024-12-06T17:21:02.116Z", updatedBy: "DHS_GIS", layout: { sections: [{ rows: [{ cards: [{ component: { name: "markdown-card", settings: { markdown: "GIS Data Disclaimer USE OF THIS DATA CONSTITUTES ACCEPTANCE DISCLAIMER OF LIABILITY DISCLAIMER OF WARRANTIES AND ACCURACY OF DATA DISCLAIMER OF ENDORSEMENT CHOICE OF LAW rights of any third parties" } } }] }] }] } } };
    return { id: WI_NOTICE_ITEM, owner: "DHS_GIS", orgId: "ISZ89Z51ft1G16OK", access: "public", type: "Hub Page", title: "GIS Data Disclaimer", modified: 1733505663000 };
  }
  if (url.includes("/rest/info?")) return { owningSystemUrl: "https://dhsgis.wi.gov/arcgis", privateUrl: "DO-NOT-RETAIN" };
  if (url.includes("/query?")) return { count: 2382 };
  if (url === `${WI_LAYER}?f=json`) return layer();
  const service = url.includes(WI_SERVICE_ITEM);
  return { id: service ? WI_SERVICE_ITEM : WI_LAYER_ITEM, owner: service ? "dhsgis@ACCOUNTS" : "DHS_GIS", access: "public", type: service ? "Map Service" : "Feature Service", url: service ? WI_LAYER.slice(0, -2) : WI_LAYER, accessInformation: "Wisconsin Department of Health Services", modified: 1755108537000,
    licenseInfo: service ? 'This data is AS IS, no completeness or accuracy, no warranty, not for legal, engineering or surveying.' : "https://data.dhsgis.wi.gov/pages/gis-data-disclaimer", privateUrl: "DO-NOT-RETAIN" };
}
export function fixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: { now: () => new Date("2026-09-08T04:00:00.000Z"), sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); }, fetchImpl: async (url, options) => {
    calls.push({ url, options }); const value = payload(url); const changed = change(value, url, calls.length) ?? value; return typeof changed === "string" ? new Response(changed) : Response.json(changed);
  } } };
}
