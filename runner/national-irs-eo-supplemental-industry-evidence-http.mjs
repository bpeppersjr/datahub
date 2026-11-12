const bodyRejected = (request) =>
  request.headers?.["transfer-encoding"] !== undefined ||
  (request.headers?.["content-length"] !== undefined &&
    request.headers["content-length"] !== "0");
async function bounded(request, response, reader, json, message) {
  const controller = new AbortController();
  let disconnected = false;
  const abort = () => {
    if (!response.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  };
  const timer = setTimeout(() => controller.abort(), 15000);
  request.once?.("aborted", abort);
  response.once?.("close", abort);
  request.resume?.();
  try {
    if (request.aborted || response.destroyed) abort();
    controller.signal.throwIfAborted();
    const result = await reader(controller.signal);
    controller.signal.throwIfAborted();
    if (!response.writableEnded && !response.destroyed) {
      response.setHeader?.("Cache-Control", "no-store");
      json(response, 200, result);
    }
  } catch {
    if (!disconnected && !response.destroyed && !response.writableEnded)
      json(response, 503, { error: message });
  } finally {
    clearTimeout(timer);
    request.removeListener?.("aborted", abort);
    response.removeListener?.("close", abort);
  }
}
export async function nationalIrsEoSupplementalIndustrySummaryHttp(
  request,
  response,
  url,
  reader,
  json,
) {
  if (
    request.method !== "GET" ||
    [...url.searchParams.keys()].length ||
    bodyRejected(request)
  ) {
    response.setHeader?.("Connection", "close");
    json(response, 400, {
      error: "IRS EO supplemental industry summary requires an empty GET.",
    });
    return;
  }
  await bounded(
    request,
    response,
    (signal) => reader({ signal }),
    json,
    "IRS EO supplemental industry summary is unavailable or incompatible.",
  );
}
export async function nationalIrsEoSupplementalIndustryZipHttp(
  request,
  response,
  url,
  reader,
  json,
) {
  const values = url.searchParams.getAll("zip");
  if (
    request.method !== "GET" ||
    values.length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== "zip") ||
    !/^\d{5}$/.test(values[0]) ||
    bodyRejected(request)
  ) {
    response.setHeader?.("Connection", "close");
    json(response, 400, {
      error:
        "IRS EO supplemental industry ZIP evidence requires one exact five-digit ZIP on an empty GET.",
    });
    return;
  }
  await bounded(
    request,
    response,
    (signal) => reader({ zip5: values[0], signal }),
    json,
    "IRS EO supplemental industry ZIP evidence is unavailable or incompatible.",
  );
}
export async function nationalIrsEoSupplementalIndustryJurisdictionHttp(
  request,
  response,
  url,
  reader,
  json,
) {
  const states = url.searchParams.getAll("state"),
    scopes = url.searchParams.getAll("scope"),
    stateValid =
      states.length === 1 &&
      scopes.length === 0 &&
      /^[A-Z]{2}$/.test(states[0]),
    scopeValid =
      scopes.length === 1 &&
      states.length === 0 &&
      (/^(state|territory):\d{2}$/.test(scopes[0]) ||
        [
          "multi-state-material",
          "zcta-overlay-unresolved",
          "non-zcta-unassigned",
          "explicit-placeholder",
        ].includes(scopes[0]));
  if (
    request.method !== "GET" ||
    !(stateValid || scopeValid) ||
    [...url.searchParams.keys()].some(
      (key) => key !== "state" && key !== "scope",
    ) ||
    bodyRejected(request)
  ) {
    response.setHeader?.("Connection", "close");
    json(response, 400, {
      error:
        "IRS EO supplemental industry jurisdiction evidence requires one governed state or scope on an empty GET.",
    });
    return;
  }
  await bounded(
    request,
    response,
    (signal) =>
      reader(
        stateValid
          ? { state: states[0], signal }
          : { scopeId: scopes[0], signal },
      ),
    json,
    "IRS EO supplemental industry jurisdiction evidence is unavailable or incompatible.",
  );
}
