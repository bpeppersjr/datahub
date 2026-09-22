import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { createLocalControlPlaneGuard } from './control-plane-security.mjs';
import { censusNonemployerCountyHeatmapHttp } from './census-nonemployer-county-heatmap-http.mjs';

async function freePort() {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address(); await new Promise(resolve => probe.close(resolve)); return port;
}
function request(port, { path = '/', token, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}

test('real HTTP request crosses auth guard before heatmap handler and enforces closed query/body contract', async t => {
  const port = await freePort(), token = 'heatmap-test-token-'.padEnd(40, 'x'), guard = createLocalControlPlaneGuard({ host: '127.0.0.1', port, controlToken: token });
  let reads = 0, rejectRead = false;
  const view = { get: async ({ stateFips, naics }) => { reads++; if (rejectRead) throw Error('local path D:\\secret\\customer-data was rejected'); return { state_fips: stateFips, naics }; } };
  const server = http.createServer(async (req, res) => {
    try {
      guard.prepare(req, res); guard.authorize(req);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/business-map/nonemployer-county-heatmap') await censusNonemployerCountyHeatmapHttp(req, res, url, view,
        (response, status, value) => { const body = JSON.stringify(value); response.writeHead(status, { 'Content-Length': Buffer.byteLength(body), 'Content-Type': 'application/json' }); response.end(body); });
      else { res.writeHead(404); res.end(); }
    } catch (error) { res.writeHead(error.statusCode ?? 500, error.responseHeaders ?? { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const route = '/api/business-map/nonemployer-county-heatmap?state_fips=15&naics=23';
  const unauthorized = await request(port, { path: route });
  assert.equal(unauthorized.status, 401); assert.equal(reads, 0);
  const authorized = await request(port, { path: route, token });
  assert.equal(authorized.status, 200); assert.deepEqual(JSON.parse(authorized.body), { state_fips: '15', naics: '23' });
  assert.equal(reads, 1);
  const duplicate = await request(port, { path: `${route}&naics=62441`, token });
  assert.equal(duplicate.status, 400); assert.equal(reads, 1);
  const unsupported = await request(port, { path: `${route}&limit=500`, token });
  assert.equal(unsupported.status, 400); assert.equal(reads, 1);
  const body = await request(port, { path: route, token, headers: { 'Transfer-Encoding': 'chunked' }, body: 'x' });
  assert.equal(body.status, 400); assert.equal(reads, 1);
  const notGet = await request(port, { path: route, token, method: 'POST' });
  assert.equal(notGet.status, 405); assert.equal(reads, 1);
  rejectRead = true;
  const redacted = await request(port, { path: route, token });
  assert.equal(redacted.status, 503); assert.match(redacted.body, /Verified county heatmap is unavailable/);
  assert.doesNotMatch(redacted.body, /secret|customer-data/);
});

test('runner attaches this route after control-plane authorization', async () => {
  const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
  const auth = source.indexOf('controlPlane.authorize(request);'), route = source.indexOf("url.pathname === '/api/business-map/nonemployer-county-heatmap'");
  assert(auth >= 0 && route > auth);
  assert.match(source.slice(route, route + 500), /census-nonemployer-county-heatmap-view/);
});
