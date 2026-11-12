const bodyRejected = request => request.headers?.["transfer-encoding"] !== undefined || request.headers?.["content-length"] !== undefined && request.headers["content-length"] !== "0";
async function bounded(request, response, reader, json, errorMessage) {
  const controller = new AbortController(); let disconnected = false;
  const abort = () => { if (!response.writableEnded) { disconnected = true; controller.abort(); } };
  const timer = setTimeout(() => controller.abort(), 15_000);
  request.once?.("aborted", abort); response.once?.("close", abort); request.resume?.();
  try {
    if (request.aborted || response.destroyed) abort(); controller.signal.throwIfAborted();
    const result = await reader(controller.signal); controller.signal.throwIfAborted();
    if (!response.writableEnded && !response.destroyed) { response.setHeader?.("Cache-Control", "no-store"); json(response, 200, result); }
  } catch { if (!disconnected && !response.destroyed && !response.writableEnded) json(response, 503, { error: errorMessage }); }
  finally { clearTimeout(timer); request.removeListener?.("aborted", abort); response.removeListener?.("close", abort); }
}
export async function nationalBusinessLifecycleJurisdictionSummaryHttp(request, response, url, reader, json) {
  if (request.method !== "GET" || [...url.searchParams.keys()].length || bodyRejected(request)) { response.setHeader?.("Connection", "close"); json(response, 400, { error: "Lifecycle jurisdiction summary requires an empty GET." }); return; }
  await bounded(request, response, signal => reader({ signal }), json, "Lifecycle jurisdiction summary is unavailable or incompatible.");
}
export async function nationalBusinessLifecycleJurisdictionEvidenceHttp(request, response, url, reader, json) {
  const state = url.searchParams.getAll("state"), scope = url.searchParams.getAll("scope"), keys = [...url.searchParams.keys()];
  const stateValid = state.length === 1 && scope.length === 0 && /^[A-Z]{2}$/.test(state[0]);
  const scopeValid = scope.length === 1 && state.length === 0 && (/^(state|territory):\d{2}$/.test(scope[0]) || ["multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"].includes(scope[0]));
  if (request.method !== "GET" || !(stateValid || scopeValid) || keys.some(key => key !== "state" && key !== "scope") || bodyRejected(request)) { response.setHeader?.("Connection", "close"); json(response, 400, { error: "Lifecycle jurisdiction evidence requires one governed state or scope on an empty GET." }); return; }
  await bounded(request, response, signal => reader(stateValid ? { state: state[0], signal } : { scopeId: scope[0], signal }), json, "Lifecycle jurisdiction evidence is unavailable or incompatible.");
}
