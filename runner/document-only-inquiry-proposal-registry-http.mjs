async function hasActualBody(request) {
  if (typeof request?.on !== "function" || typeof request?.resume !== "function") return false;
  if (request.readableEnded) return (request.readableLength ?? 0) > 0;
  return new Promise((resolve) => {
    let nonempty = false;
    request.on("data", (chunk) => { if (chunk?.length) nonempty = true; });
    request.once("end", () => resolve(nonempty));
    request.once("error", () => resolve(true));
    request.resume();
  });
}

export async function documentOnlyInquiryProposalRegistryHttp(request, response, url, loadView, json) {
  if (request.method !== "GET") { json(response, 405, { error: "Proposal registry is read-only." }); return; }
  if ([...url.searchParams.keys()].length > 0) { json(response, 400, { error: "Proposal registry does not accept query parameters." }); return; }
  const contentLength = request.headers?.["content-length"];
  if ((contentLength !== undefined && contentLength !== "0") || request.headers?.["transfer-encoding"] !== undefined || await hasActualBody(request)) {
    json(response, 400, { error: "Proposal registry accepts an empty GET only." }); return;
  }
  try { json(response, 200, await loadView()); }
  catch { json(response, 503, { error: "The verified document-only inquiry proposal registry is unavailable. No action was taken." }); }
}
