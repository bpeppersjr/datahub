const hasBody = request => Number(request.headers?.["content-length"] ?? 0) > 0 || request.headers?.["transfer-encoding"] !== undefined;

export async function operationalIndustryCensusStatusHttp(request, response, url, reader, json) {
  if (request.method !== "GET") { json(response, 405, { error: "Operational industry Census status is read-only." }); return; }
  if ([...url.searchParams.keys()].length || hasBody(request)) { json(response, 400, { error: "Operational industry Census status accepts an empty GET only." }); return; }
  try { json(response, 200, await reader()); }
  catch { json(response, 503, { error: "Operational industry Census status is unavailable." }); }
}
