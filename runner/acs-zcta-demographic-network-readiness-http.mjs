export async function acsZctaDemographicNetworkReadinessHttp(
  request,
  response,
  url,
  reader,
  json,
) {
  const headers = request.headers ?? {};
  if (
    request.method !== "GET" ||
    url.searchParams.size ||
    headers["transfer-encoding"] !== undefined ||
    (headers["content-length"] !== undefined &&
      headers["content-length"] !== "0")
  ) {
    response.setHeader?.("Connection", "close");
    json(response, 400, {
      error: "ACS ZCTA demographic readiness requires an empty GET.",
    });
    return;
  }
  const controller = new AbortController();
  let disconnected = false;
  const abort = () => {
    if (!response.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  };
  const timer = setTimeout(() => controller.abort(), 30_000);
  request.once?.("aborted", abort);
  response.once?.("close", abort);
  request.resume?.();
  try {
    if (request.aborted || response.destroyed) abort();
    controller.signal.throwIfAborted();
    const value = await reader({ signal: controller.signal });
    controller.signal.throwIfAborted();
    if (!disconnected && !response.destroyed && !response.writableEnded) {
      response.setHeader?.("Cache-Control", "no-store");
      json(response, 200, value);
    }
  } catch {
    if (!disconnected && !response.destroyed && !response.writableEnded)
      json(response, 503, {
        error: "ACS ZCTA demographic readiness is unavailable. No action was taken.",
      });
  } finally {
    clearTimeout(timer);
    request.removeListener?.("aborted", abort);
    response.removeListener?.("close", abort);
  }
}
