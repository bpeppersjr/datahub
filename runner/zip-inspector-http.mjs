export async function zipInspectorHttp(request, response, url, view, json) {
  const keys = [...url.searchParams.keys()];
  const categories = url.searchParams.getAll("category");
  const category = categories[0] ?? "all";
  if (request.method !== "GET" || keys.some((key) => key !== "zip" && key !== "category")
    || url.searchParams.getAll("zip").length !== 1 || categories.length > 1
    || !/^[a-z][a-z0-9-]{1,79}$/.test(category)) {
    json(response, 400, { error: "ZIP inspector requires one exact ZIP option and at most one valid category." });
    return;
  }
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableEnded) controller.abort(); };
  request.once?.("aborted", disconnected);
  response.once?.("close", disconnected);
  try {
    json(response, 200, await view({ zip: url.searchParams.get("zip"), categoryId: category, signal: controller.signal }));
  } catch (error) {
    if (!controller.signal.aborted && !response.writableEnded) json(response, error.statusCode === 400 ? 400 : 503, { error: error.statusCode === 400 ? error.message : "Selected ZIP evidence is unavailable or mismatched." });
  } finally {
    request.removeListener?.("aborted", disconnected);
    response.removeListener?.("close", disconnected);
  }
}
