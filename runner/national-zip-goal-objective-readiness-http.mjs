import { readNationalZipGoalAcceptance, projectNationalZipObjectiveReadiness } from './national-zip-goal-acceptance.mjs';

export async function nationalZipGoalObjectiveReadinessHttp(request, response, url, json, {
  reader = readNationalZipGoalAcceptance,
  projector = projectNationalZipObjectiveReadiness,
  timeoutMs = 30000,
} = {}) {
  const headers = request.headers ?? {};
  if (request.method !== 'GET' || url.searchParams.size !== 0 || headers['transfer-encoding'] !== undefined
      || (headers['content-length'] !== undefined && headers['content-length'] !== '0')) {
    response.setHeader?.('Connection', 'close');
    json(response, 400, { error: 'National objective readiness requires an empty GET.' });
    return;
  }
  const controller = new AbortController(); let disconnected = false, rejectAbort;
  const abort = () => {
    if (!response.writableEnded && !response.destroyed) {
      disconnected = true; controller.abort();
    }
  };
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => reject(Error('Objective readiness lookup aborted.'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  aborted.catch(() => {});
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  request.once?.('aborted', abort);
  response.once?.('close', abort);
  request.resume?.();
  try {
    if (request.aborted || response.destroyed) abort();
    controller.signal.throwIfAborted();
    const report = await Promise.race([reader({ claim: 'every-active-business-by-valid-zip', signal: controller.signal }), aborted]);
    controller.signal.throwIfAborted();
    const result = projector(report);
    if (!response.writableEnded && !response.destroyed) {
      response.setHeader?.('Cache-Control', 'no-store');
      json(response, 200, result);
    }
  } catch (error) {
    if (!disconnected && !response.destroyed && !response.writableEnded)
      json(response, 503, { error: 'National objective readiness evidence is unavailable or incompatible.',
        ...(error?.code === 'LIFECYCLE_RELEASE_INVALID' ? { blocker_code: 'lifecycle-release-unavailable-or-invalid' }
          : error?.code === 'REPORTING_SITE_RELEASE_INVALID' ? { blocker_code: 'reporting-only-site-release-unavailable-or-invalid' } : {}) });
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', rejectAbort);
    request.removeListener?.('aborted', abort);
    response.removeListener?.('close', abort);
  }
}
