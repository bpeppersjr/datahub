export async function zipGdpSegmentationHttp(request, response, url, reader, json) {
  const zipValues = url.searchParams.getAll("zip");
  const invalid = request.method !== "GET"
    || zipValues.length !== 1
    || [...url.searchParams.keys()].some((key) => key !== "zip")
    || !/^\d{5}$/.test(zipValues[0] ?? "")
    || request.headers?.["transfer-encoding"] !== undefined
    || (request.headers?.["content-length"] !== undefined && request.headers["content-length"] !== "0");
  if (invalid) {
    response.setHeader?.("Connection", "close");
    json(response, 400, { error: "ZIP GDP segmentation requires one exact five-digit ZIP on an empty GET." });
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
    const value = await reader({ zip5: zipValues[0], signal: controller.signal });
    controller.signal.throwIfAborted();
    if (!response.writableEnded && !response.destroyed) {
      response.setHeader?.("Cache-Control", "no-store");
      json(response, 200, value);
    }
  } catch {
    if (!disconnected && !response.destroyed && !response.writableEnded) {
      json(response, 503, { error: "ZIP GDP segmentation view is unavailable or incompatible." });
    }
  } finally {
    clearTimeout(timer);
    request.removeListener?.("aborted", abort);
    response.removeListener?.("close", abort);
  }
}

