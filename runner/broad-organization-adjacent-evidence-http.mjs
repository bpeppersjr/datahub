import { loadBroadOrganizationAdjacentEvidenceView } from "./broad-organization-adjacent-evidence-view.mjs";

export async function broadOrganizationAdjacentEvidenceHttp(request, response, url, json, loader = loadBroadOrganizationAdjacentEvidenceView) {
  if (request.method !== "GET") return json(response, 405, { error: "method-not-allowed" });
  if ([...url.searchParams.keys()].some((key) => key !== "state") || url.searchParams.getAll("state").length > 1) return json(response, 400, { error: "invalid-query" });
  const state = url.searchParams.get("state") ?? undefined;
  if (state !== undefined && !/^[A-Z]{2}$/.test(state)) return json(response, 400, { error: "invalid-state" });
  try { return json(response, 200, await loader({ state })); }
  catch { return json(response, 503, { error: "adjacent-evidence-unavailable" }); }
}
