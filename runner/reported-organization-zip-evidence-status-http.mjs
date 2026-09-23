async function body(request) { if (request.readableEnded) return (request.readableLength ?? 0) > 0; return new Promise((resolve) => { let found = false; request.on('data', (chunk) => { if (chunk?.length) found = true; }); request.once('end', () => resolve(found)); request.once('error', () => resolve(true)); request.resume(); }); }
export async function reportedOrganizationZipEvidenceStatusHttp(request, response, url, loadView, json) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Reported organization ZIP evidence status is read-only.' });
  if ([...url.searchParams].length) return json(response, 400, { error: 'Reported organization ZIP evidence status accepts no query parameters.' });
  if ((request.headers?.['content-length'] !== undefined && request.headers['content-length'] !== '0') || request.headers?.['transfer-encoding'] !== undefined || await body(request)) return json(response, 400, { error: 'Reported organization ZIP evidence status accepts an empty GET only.' });
  try { json(response, 200, await loadView()); } catch { json(response, 503, { error: 'Verified reported organization ZIP evidence status is unavailable. No action was taken.' }); }
}
