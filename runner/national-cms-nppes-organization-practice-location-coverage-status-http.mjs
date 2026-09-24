async function hasBody(request) {
  if (typeof request?.on !== 'function' || typeof request?.resume !== 'function') return false;
  if (request.readableEnded) return (request.readableLength ?? 0) > 0;
  return new Promise((resolve) => {
    let any = false;
    request.on('data', (chunk) => { if (chunk?.length) any = true; });
    request.once('end', () => resolve(any));
    request.once('error', () => resolve(true));
    request.resume();
  });
}

export async function nationalCmsNppesOrganizationPracticeLocationCoverageStatusHttp(request, response, url, loadView, json) {
  if (request.method !== 'GET') { json(response, 405, { error: 'National CMS NPPES organization practice-location coverage status is read-only.' }); return; }
  if ([...url.searchParams.keys()].length) { json(response, 400, { error: 'National CMS NPPES organization practice-location coverage status accepts no query parameters.' }); return; }
  const length = request.headers?.['content-length'];
  if ((length !== undefined && length !== '0') || request.headers?.['transfer-encoding'] !== undefined || await hasBody(request)) { json(response, 400, { error: 'National CMS NPPES organization practice-location coverage status accepts an empty GET only.' }); return; }
  try { json(response, 200, await loadView()); } catch { json(response, 503, { error: 'Verified national CMS NPPES organization practice-location coverage is unavailable. No action was taken.' }); }
}
