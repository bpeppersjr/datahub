export async function censusZbpIndustryHttp(request, response, url, view, json) {
  const controller = new AbortController(), disconnected = () => { if (!response.writableEnded) controller.abort(); };
  request.once?.("aborted", disconnected); response.once?.("close", disconnected);
  if (request.method !== "GET") { json(response, 405, { error: "Method not allowed." }); return; }
  const allowed = new Set(["naics", "limit"]);
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !allowed.has(key)) || keys.some((key, index) => keys.indexOf(key) !== index)) { json(response, 400, { error: "Unsupported Census ZBP industry option." }); return; }
  try {
    const value = await view.get({ naics: url.searchParams.get("naics"), limit: url.searchParams.get("limit") === null ? undefined : Number(url.searchParams.get("limit")) }, { signal: controller.signal });
    if (!controller.signal.aborted && !response.destroyed) json(response, 200, value);
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return;
    json(response, error.statusCode === 400 || error.statusCode === 404 ? error.statusCode : 503, { error: error.message });
  } finally { request.removeListener?.("aborted", disconnected); response.removeListener?.("close", disconnected); }
}
