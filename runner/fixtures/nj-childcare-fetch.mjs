// Offline subprocess fixture only. Never imported by production entry points.
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM, NJ_CHILDCARE_ITEM_URL, NJ_CHILDCARE_SCHEMA } from "../nj-childcare-preflight.mjs";
import { NJ_CHILDCARE_METADATA_URL } from "../nj-childcare-metadata.mjs";

const date = 1786463205000;
globalThis.fetch = async (url) => {
  const parsed = new URL(url), base = `${parsed.origin}${parsed.pathname}`, params = parsed.searchParams;
  if (![NJ_CHILDCARE_LAYER, `${NJ_CHILDCARE_LAYER}/query`, NJ_CHILDCARE_ITEM_URL, NJ_CHILDCARE_METADATA_URL].includes(base)) throw new Error("Unexpected NJ fixture source");
  if (base === NJ_CHILDCARE_METADATA_URL) return new Response("<?xml version=\"1.0\"?><metadata>Strc_DCF_childcare Offline fixture: preserve NJDEP metadata and prescribed notices.</metadata>", { headers: { "content-type": "application/xml" } });
  const attributes = Object.fromEntries(NJ_CHILDCARE_SCHEMA.map(([name]) => [name, null]));
  Object.assign(attributes, { OBJECTID: 1, center_id: "00001", center_name: "Offline Fixture Center", address: "10 Example Street", city: "Trenton", county: "Mercer", state: "NJ", zip: "08625-0123", licensed_capacity: 20, foips: "Y", download_date: date });
  if (process.env.NJ_FIXTURE_INVALID === "1") attributes.center_phone = "EXCLUDED_FIXTURE";
  const payload = base === NJ_CHILDCARE_LAYER ? {
    id: 4, name: "Child Care Centers", type: "Feature Layer", geometryType: "esriGeometryPoint",
    extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, capabilities: "Map,Query,Data", maxRecordCount: 2000,
    advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
    fields: NJ_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}), domain: null })),
  } : base === NJ_CHILDCARE_ITEM_URL ? {
    id: NJ_CHILDCARE_ITEM, owner: "NJDEPBGIS", access: "public", type: "Feature Service", title: "Child Care Centers of New Jersey",
    url: NJ_CHILDCARE_LAYER, modified: 1758741707000, created: 1500000000000,
    licenseInfo: "Offline fixture: preserve complete NJDEP metadata and prescribed credit/disclaimer for derived publications; local review only.",
  } : params.has("returnCountOnly") ? { count: 1 }
    : params.has("returnIdsOnly") ? { objectIdFieldName: "OBJECTID", objectIds: [1] }
      : params.has("outStatistics") ? { features: [{ attributes: { download_date_min: date, download_date_max: date, download_date_count: 1 } }] }
        : { spatialReference: { wkid: 4326, latestWkid: 4326 }, features: [{ attributes, geometry: { x: -74.2, y: 40.1 } }] };
  return new Response(JSON.stringify(payload));
};
