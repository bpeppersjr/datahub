export async function zipInspectorHttp(request, response, url, view, json) {
  if (request.method !== "GET" || [...url.searchParams.keys()].some((key) => key !== "zip") || url.searchParams.getAll("zip").length !== 1) {
    json(response, 400, { error: "ZIP inspector requires one exact ZIP option." });
    return;
  }
  try {
    json(response, 200, await view({ zip: url.searchParams.get("zip") }));
  } catch (error) {
    json(response, error.statusCode === 400 ? 400 : 503, { error: error.statusCode === 400 ? error.message : "Selected ZIP evidence is unavailable or mismatched." });
  }
}
