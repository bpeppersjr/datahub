export async function broadOrganizationAuthorizationPacketHttp(request, response, url, loadView, json) {
  if (request.method !== "GET") {
    json(response, 405, { error: "Authorization packet management view is read-only." });
    return;
  }
  if ([...url.searchParams.keys()].length > 0) {
    json(response, 400, { error: "Authorization packet management view does not accept query parameters." });
    return;
  }
  const contentLength = request.headers?.["content-length"];
  if ((contentLength !== undefined && contentLength !== "0") || request.headers?.["transfer-encoding"] !== undefined) {
    json(response, 400, { error: "Authorization packet management view accepts an empty GET only." });
    return;
  }
  try {
    json(response, 200, await loadView());
  } catch {
    json(response, 503, { error: "The verified authorization packet is unavailable. No action was taken." });
  }
}
