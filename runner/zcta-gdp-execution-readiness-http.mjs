export async function zctaGdpExecutionReadinessHttp(
  request,
  response,
  url,
  reader,
  json,
) {
  if (
    request.method !== "GET" ||
    [...url.searchParams.keys()].some((k) => k !== "zcta") ||
    url.searchParams.getAll("zcta").length !== 1 ||
    !/^\d{5}$/.test(url.searchParams.get("zcta") ?? "") ||
    request.headers?.["transfer-encoding"] !== undefined ||
    (request.headers?.["content-length"] !== undefined &&
      request.headers["content-length"] !== "0")
  ) {
    json(response, 400, {
      error: "Execution readiness requires an empty GET and one ZCTA.",
    });
    return;
  }
  const controller = new AbortController(),
    abort = () => controller.abort(),
    timer = setTimeout(abort, 30000);
  request.once?.("aborted", abort);
  response.once?.("close", abort);
  request.resume?.();
  try {
    const value = await reader({
      zcta: url.searchParams.get("zcta"),
      signal: controller.signal,
    });
    if (!response.destroyed && !response.writableEnded)
      json(response, 200, value);
  } catch (e) {
    if (!response.destroyed && !response.writableEnded)
      json(response, e.statusCode === 400 ? 400 : 503, {
        error:
          e.statusCode === 400
            ? e.message
            : "ZCTA GDP execution readiness is unavailable.",
      });
  } finally {
    clearTimeout(timer);
    request.removeListener?.("aborted", abort);
    response.removeListener?.("close", abort);
  }
}
