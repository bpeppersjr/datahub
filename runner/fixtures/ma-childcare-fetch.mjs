// Offline subprocess fixture only. Never imported by production entry points.
import { MA_CHILDCARE_SCHEMA, MA_CHILDCARE_ITEM, MA_CHILDCARE_LAYER } from "../ma-childcare-preflight.mjs";

globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  if (![MA_CHILDCARE_LAYER, `${MA_CHILDCARE_LAYER}/query`].includes(`${parsed.origin}${parsed.pathname}`)) throw new Error("Unexpected fixture source");
  const params = parsed.searchParams;
  const payload = !parsed.pathname.endsWith("/query") ? {
    id: 0, name: "Licensed Child Care Programs", type: "Feature Layer", serviceItemId: MA_CHILDCARE_ITEM,
    objectIdField: "OBJECTID", geometryType: "esriGeometryPoint", spatialReference: { wkid: 26986 }, extent: { spatialReference: { wkid: 26986 } },
    capabilities: "Query", maxRecordCount: 500, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
    fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, length, nullable: name !== "OBJECTID" })),
    editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 },
  } : params.has("returnCountOnly") ? { count: 1 }
    : params.has("returnIdsOnly") ? { objectIdFieldName: "OBJECTID", objectIds: [1] }
      : { spatialReference: { wkid: 4326 }, features: [{ attributes: {
        OBJECTID: 1, PROV_NUM: "P-FIXTURE", PROG_NAME: "Offline Fixture Center", ADDRESS: "10 Main Street", CITY: "Boston", ZIPCODE: "02108-1234",
        LICENSED_STATUS: "Current", PROG_TYPE: process.env.MA_FIXTURE_INVALID === "1" ? "Family Child Care" : "Center-based Care",
        CAPACITY: 20, PROG_UM: null, LICENSED_FUNDED: "Licensed", MAD_ID: null,
      }, geometry: { x: -71, y: 42 } }] };
  return new Response(JSON.stringify(payload));
};
