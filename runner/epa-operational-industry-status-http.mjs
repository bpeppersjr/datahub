import { STATE_DC_CODES } from './national-epa-echo-naics-zip-industry-evidence.mjs';
export async function epaOperationalIndustryStatusHttp(request,response,url,reader,json) {
  if (request.method !== 'GET') { json(response,405,{error:'Method not allowed.'}); return; }
  const values = url.searchParams.getAll('state');
  if (Number(request.headers?.['content-length'] ?? 0) !== 0 || request.headers?.['transfer-encoding'] || [...url.searchParams.keys()].some(key => key !== 'state') || values.length > 1 || values.length === 1 && !STATE_DC_CODES.includes(values[0])) { json(response,400,{error:'Supply an empty GET with an optional single state or D.C. postal abbreviation.'}); return; }
  try { json(response,200,await reader({state:values[0] ?? null})); }
  catch { json(response,503,{error:'Supplemental EPA industry evidence is unavailable or incompatible. Base Industry Status remains available.'}); }
}
