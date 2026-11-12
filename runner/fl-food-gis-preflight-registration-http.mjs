export async function flFoodGisPreflightRegistrationHttp(request, response, url, reader, json) {
  if (request.method !== "GET") { json(response, 405, { error: "Florida retail prerequisite status is read-only." }); return; }
  if ([...url.searchParams.keys()].length || Number(request.headers?.["content-length"] ?? 0) > 0 || request.headers?.["transfer-encoding"] !== undefined) { json(response, 400, { error: "Florida retail prerequisite status accepts an empty GET only." }); return; }
  try { json(response, 200, await reader()); }
  catch { json(response, 503, { error: "Florida retail prerequisite status is unavailable." }); }
}
