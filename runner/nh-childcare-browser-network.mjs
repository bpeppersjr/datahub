const HOSTS = new Set(['new-hampshire.my.site.com', 'maps.googleapis.com', 'maps.gstatic.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'ajax.googleapis.com', 'cdn.datatables.net',
  'maxcdn.bootstrapcdn.com', 'mayflower.digital.mass.gov', 'translate.google.com',
  'www.google.com', 'www.gstatic.com', 'www.googletagmanager.com']);

// Hosts are public-page dependencies, not a general-purpose caller allowlist.
export function createNhBrowserNetworkGuard(signal) {
  let requests = 0, denied = false;
  return {
    snapshot: () => ({ requests, denied }),
    async route(route) {
      requests++;
      let response;
      try {
        const url = new URL(route.request().url());
        if (signal?.aborted || requests > 120 || url.protocol !== 'https:' || !HOSTS.has(url.hostname)
          || url.port || url.username || url.password) throw Error('Scope');
        // Playwright routes only the first URL in a redirect chain. Never
        // follow a redirect before checking its destination.
        response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15000 });
        if (response.status() >= 300 && response.status() < 400 || [401, 403, 429].includes(response.status())) throw Error('Delivery');
        await route.fulfill({ response });
      } catch { denied = true; await route.abort().catch(() => {});
      } finally { try { await response?.dispose(); } catch { denied = true; } }
    },
  };
}
