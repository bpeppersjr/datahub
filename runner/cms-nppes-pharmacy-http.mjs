import { loadCmsNppesPharmacyNonprimaryRows } from './cms-nppes-pharmacy-nonprimary-addresses.mjs';

export async function cmsNppesPharmacyHttp(request, response, url, view, json, secondaryView = { get: loadCmsNppesPharmacyNonprimaryRows }) {
  if (request.method !== 'GET') { json(response, 405, { error: 'Method not allowed.' }); return; }
  const allowed = new Set(['level', 'state', 'zip', 'query', 'limit', 'address_role']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key) || url.searchParams.getAll(key).length > 1)) { json(response, 400, { error: 'Unsupported or repeated pharmacy option.' }); return; }
  try {
    const addressRole = url.searchParams.get('address_role');
    if (addressRole && addressRole !== 'non-primary-practice-location') { json(response, 400, { error: 'Unsupported pharmacy address role.' }); return; }
    if (addressRole === 'non-primary-practice-location') {
      json(response, 200, await secondaryView.get({ state: url.searchParams.get('state'), zip: url.searchParams.get('zip'), query: url.searchParams.get('query'), limit: Number(url.searchParams.get('limit') || 25) })); return;
    }
    json(response, 200, await view.get({ level: url.searchParams.get('level') || 'states', state: url.searchParams.get('state'), zip: url.searchParams.get('zip'), query: url.searchParams.get('query'), limit: url.searchParams.get('limit') }));
  } catch (error) { json(response, error.statusCode === 400 ? 400 : 503, { error: error.statusCode === 400 ? error.message : 'Governed NPPES pharmacy evidence is unavailable. No source data was requested.' }); }
}
