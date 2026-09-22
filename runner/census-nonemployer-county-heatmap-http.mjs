export async function censusNonemployerCountyHeatmapHttp(request, response, url, view, json) {
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableEnded) controller.abort(); };
  request.once?.('aborted', disconnected);
  response.once?.('close', disconnected);
  try {
    if (request.method !== 'GET') { json(response, 405, { error: 'Method not allowed.' }); return; }
    const allowed = new Set(['state_fips', 'naics']), keys = [...url.searchParams.keys()];
    if (keys.some(key => !allowed.has(key)) || keys.some((key, index) => keys.indexOf(key) !== index)
      || ['state_fips', 'naics'].some(key => url.searchParams.getAll(key).length !== 1)) {
      json(response, 400, { error: 'Provide one state_fips and one naics option.' }); return;
    }
    const transferEncoding = request.headers?.['transfer-encoding'];
    const contentLength = request.headers?.['content-length'];
    if (transferEncoding !== undefined || (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > 0))
      || (Number(request.readableLength) > 0)) {
      json(response, 400, { error: 'GET requests for county context cannot contain a body.' }); return;
    }
    const value = await view.get({ stateFips: url.searchParams.get('state_fips'), naics: url.searchParams.get('naics') }, { signal: controller.signal });
    if (!controller.signal.aborted && !response.destroyed) json(response, 200, value);
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return;
    const invalid = error.statusCode === 400;
    json(response, invalid ? 400 : 503, { error: invalid ? error.message : 'Verified county heatmap is unavailable.' });
  } finally {
    request.removeListener?.('aborted', disconnected);
    response.removeListener?.('close', disconnected);
  }
}
