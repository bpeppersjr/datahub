const HOSTS = new Set(['new-hampshire.my.site.com', 'maps.googleapis.com', 'maps.gstatic.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'ajax.googleapis.com', 'cdn.datatables.net',
  'maxcdn.bootstrapcdn.com', 'mayflower.digital.mass.gov', 'translate.google.com',
  'www.google.com', 'www.gstatic.com', 'www.googletagmanager.com']);

// Hosts are public-page dependencies, not a general-purpose caller allowlist.
export function createNhBrowserNetworkGuard(signal) { return createGuard(signal, false); }
export function createNhVisibleNetworkGuard(signal) { return createGuard(signal, true); }
function createGuard(signal, visibleMode) {
  let requests = 0, denied = false;
  let closing = false, inFlight = 0;
  const idleWaiters = new Set();
  const failures = [], excluded = [], shutdownFailures = [];
  const optional = new Map([
    ['www.google-analytics.com', new Set(['script', 'fetch'])],
    ['translate.googleapis.com', new Set(['script'])],
    ['maps.google.com', new Set(['image'])],
  ]);
  return {
    snapshot: () => ({ requests, denied }),
    pendingRequests: () => inFlight,
    async settle() {
      if (!inFlight) return;
      let timer, resolveIdle;
      try {
        await Promise.race([new Promise(resolve => { resolveIdle = resolve; idleWaiters.add(resolve); }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Browser network did not settle.')), 20000); })]);
        if (inFlight) throw Error('Browser network did not settle.');
      } finally { clearTimeout(timer); idleWaiters.delete(resolveIdle); }
    },
    exclusions: () => excluded.map(value => ({ ...value })),
    shutdownDiagnostics: () => shutdownFailures.map(value => ({ ...value })),
    // Only transport/fulfill failures after the explicit browser-close boundary
    // are classified separately. Scope and HTTP access-policy failures always
    // remain fatal. The old CSV probe retains its strict behavior.
    beginClose: () => { if (visibleMode) closing = true; },
    // Bounded diagnostics only: unsupported public DNS hostnames may be
    // identified, but never URL paths/queries, credentials or source content.
    diagnostics: () => failures.map(value => ({ ...value })),
    async route(route) {
      requests++; inFlight++;
      let response, phase = 'request-scope', status = null, scopeReason = 'invalid-url', host = null, resourceType = null;
      try {
        const request = route.request(), type = request.resourceType?.();
        if (['document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other'].includes(type)) resourceType = type;
        const url = new URL(request.url());
        scopeReason = signal?.aborted ? 'cancelled' : requests > 120 ? 'request-budget' : url.username || url.password ? 'credentials'
          : url.port ? 'port' : url.protocol !== 'https:' ? 'protocol' : !HOSTS.has(url.hostname) ? 'unsupported-host' : null;
        if (visibleMode && scopeReason === 'unsupported-host' && optional.get(url.hostname)?.has(resourceType)) {
          if (excluded.length < 120) excluded.push({ host: url.hostname, resource_type: resourceType, reason: 'nonessential-visible-projection-resource' });
          await route.abort(); return;
        }
        if (scopeReason) {
          if (!url.username && !url.password && ['http:', 'https:'].includes(url.protocol) && url.hostname.length <= 253
            && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)) host = url.hostname;
          throw Error('Scope');
        }
        // Playwright routes only the first URL in a redirect chain. Never
        // follow a redirect before checking its destination.
        phase = 'transport';
        response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15000 });
        status = response.status(); phase = 'response-policy';
        if (status >= 300 && status < 400 || [401, 403, 429].includes(status)) throw Error('Delivery');
        phase = 'fulfill';
        await route.fulfill({ response });
      } catch {
        const shutdown = visibleMode && closing && ['transport', 'fulfill'].includes(phase);
        if (!shutdown) denied = true;
        const target = shutdown ? shutdownFailures : failures;
        if (target.length < 120) target.push({ phase, status, cancelled: signal?.aborted === true,
          ...(phase === 'request-scope' ? { scope_reason: scopeReason, host, resource_type: resourceType } : {}) });
        await route.abort().catch(() => {});
      } finally { try { await response?.dispose(); } catch { denied = true;
        if (failures.length < 120) failures.push({ phase: 'dispose', status, cancelled: signal?.aborted === true }); }
        inFlight--; if (!inFlight) for (const resolve of idleWaiters) resolve();
      }
    },
  };
}
