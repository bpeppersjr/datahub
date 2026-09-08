// Synthetic transport only. Production entry points never import this fixture.
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_ITEM, TN_CHILDCARE_ORG, TN_CHILDCARE_SCHEMA, TN_CHILDCARE_TERMS_TEXT, TN_CHILDCARE_ITEM_URL, TN_CHILDCARE_XML_URL } from "../tn-childcare-preflight.mjs";

export function createTnChildcareFixture({ count = 1, mutate = () => {} } = {}) {
  const calls = [], occurrences = {};
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url), base = `${parsed.origin}${parsed.pathname}`, params = parsed.searchParams;
    if (![TN_CHILDCARE_LAYER, `${TN_CHILDCARE_LAYER}/query`, TN_CHILDCARE_ITEM_URL, TN_CHILDCARE_XML_URL, `https://www.arcgis.com/sharing/rest/portals/${TN_CHILDCARE_ORG}`].includes(base)) throw new Error("Unexpected TN fixture source");
    const kind = params.has("objectIds") ? "features" : params.has("returnIdsOnly") ? "inventory" : params.has("returnCountOnly") ? "count"
      : base === TN_CHILDCARE_XML_URL ? "xml" : base === TN_CHILDCARE_ITEM_URL ? "item" : base.includes("/portals/") ? "organization" : "metadata";
    calls.push({ url, options, kind }); occurrences[kind] = (occurrences[kind] ?? 0) + 1;
    let payload = kind === "metadata" ? {
      id: 0, name: "Active_ChildCare_Master", type: "Feature Layer", serviceItemId: TN_CHILDCARE_ITEM, objectIdField: "OBJECTID", displayField: "Provider_Name",
      geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326, latestWkid: 4326 }, extent: { spatialReference: { wkid: 4326, latestWkid: 4326 } },
      capabilities: "Query,Extract", maxRecordCount: 2000, hasMetadata: true, hasAttachments: false,
      editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 },
      advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
      fields: TN_CHILDCARE_SCHEMA.map(([name, type, length, nullable]) => ({ name, type, ...(length === null ? {} : { length }), nullable, domain: null })),
    } : kind === "item" ? {
      id: TN_CHILDCARE_ITEM, owner: "kwinchester_sts", orgId: TN_CHILDCARE_ORG, access: "public", type: "Feature Service", title: "Active Statewide Childcare Locations",
      url: TN_CHILDCARE_LAYER.slice(0, -2), accessInformation: "TN Department of Human Services", created: 1732643560000, modified: 1788460782000, licenseInfo: TN_CHILDCARE_TERMS_TEXT,
    } : kind === "organization" ? { id: TN_CHILDCARE_ORG, name: "State of Tennessee STS GIS", urlKey: "tnmap" }
      : kind === "count" ? { count } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, index) => index + 1) }
        : kind === "xml" ? Buffer.from("\ufeff<metadata>Active_ChildCare_Locations Synthetic offline fixture</metadata>\n")
          : { spatialReference: { wkid: 4326 }, features: params.get("objectIds").split(",").map(Number).map((id) => ({
            attributes: { OBJECTID: id, Provider_ID: id, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center",
              Provider_Name: "Offline Fixture Center", Street_Address: "1 Main Street", Street_Address_2: null, City: "Nashville", State: "TN", Zip: "37201-0123", County: "Davidson" }, geometry: { x: -86.78, y: 36.16 },
          })) };
    const changed = mutate(payload, kind, occurrences[kind], params, options);
    if (changed instanceof Response) return changed;
    if (changed !== undefined) payload = changed;
    return kind === "xml" ? new Response(payload, { headers: { "content-type": "application/xml" } }) : new Response(JSON.stringify(payload));
  };
  return { fetchImpl, calls };
}

if (process.env.TN_CHILDCARE_FIXTURE_PRELOAD === "1") globalThis.fetch = createTnChildcareFixture({ mutate: (payload, kind) => {
  if (kind === "features" && process.env.TN_CHILDCARE_FIXTURE_INVALID === "1") payload.features[0].attributes.owner = "PRIVATE_FIXTURE";
} }).fetchImpl;
