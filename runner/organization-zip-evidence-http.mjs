import { ORGANIZATION_ZIP_PUBLISHERS } from './organization-zip-evidence-reader.mjs';

export async function organizationZipEvidenceHttp(request, response, url, reader, json, signal) {
  if (request.method !== 'GET') { json(response, 405, { error: 'Method not allowed.' }); return; }
  const headers = request.headers ?? {};
  const body = request.body;
  const hasBody = request.readableLength > 0 || body != null && body !== '' && !(Buffer.isBuffer(body) && body.length === 0);
  if (headers['transfer-encoding'] !== undefined || headers['content-length'] !== undefined && headers['content-length'] !== '0' || hasBody) {
    response.setHeader?.('Connection', 'close'); json(response, 400, { error: 'Organization ZIP evidence requests must have an empty body.' }); return;
  }
  request.resume?.();
  if (request.aborted || response.destroyed) return;
  const allowed = new Set(['zip', 'publisher_state', 'policy_mode', 'limit', 'cursor']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)
    || url.searchParams.getAll('zip').length !== 1 || url.searchParams.getAll('policy_mode').length !== 1) {
    json(response, 400, { error: 'Organization ZIP evidence requires one exact ZIP and policy mode.' }); return;
  }
  const zip5 = url.searchParams.get('zip'); const policyMode = url.searchParams.get('policy_mode');
  const publisherState = url.searchParams.get('publisher_state'); const rawLimit = url.searchParams.get('limit'); const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!/^\d{5}$/.test(zip5 ?? '') || !['public-only', 'local-review'].includes(policyMode)
    || publisherState !== null && !ORGANIZATION_ZIP_PUBLISHERS.includes(publisherState)
    || rawLimit !== null && (!/^\d{1,3}$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    || url.searchParams.has('cursor') && !url.searchParams.get('cursor')) {
    json(response, 400, { error: 'Organization ZIP evidence selection is invalid.' }); return;
  }
  try {
    json(response, 200, await reader.get({ zip5, policyMode, publisherState, limit, cursor: url.searchParams.get('cursor'), signal }));
  } catch (error) {
    json(response, error.statusCode === 400 ? 400 : error.name === 'AbortError' ? 499 : 503,
      { error: error.statusCode === 400 ? error.message : error.name === 'AbortError' ? 'Organization ZIP evidence request was cancelled.' : 'Pinned organization ZIP evidence failed verification.' });
  }
}
