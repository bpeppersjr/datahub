export async function cmsNppesPharmacyHttp(request, response, url, view, json) {
  if (request.method !== 'GET') { json(response, 405, { error: 'Method not allowed.' }); return; }
  const allowed = new Set(['state', 'zip', 'query', 'limit']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key) || url.searchParams.getAll(key).length > 1)) { json(response, 400, { error: 'Unsupported or repeated pharmacy option.' }); return; }
  try { json(response, 200, await view.get({ state: url.searchParams.get('state'), zip: url.searchParams.get('zip'), query: url.searchParams.get('query'), limit: url.searchParams.get('limit') })); }
  catch (error) { json(response, error.statusCode === 400 ? 400 : 503, { error: error.statusCode === 400 ? error.message : 'Governed NPPES pharmacy evidence is unavailable. No source data was requested.' }); }
}
