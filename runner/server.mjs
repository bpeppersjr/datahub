import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import path from 'node:path';
import { createStore } from './store.mjs';
import { cleanupExpiredGooglePlacesOutputs } from './google-places.mjs';
import { inspectNppesSource } from './nppes-source.mjs';
import { RunnerPool } from './pool.mjs';
import { APP_ROOT, resolveAppPath } from './paths.mjs';

try {
  process.loadEnvFile(path.join(APP_ROOT, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const PORT = Number(process.env.RUNNER_PORT) || 4300;
const HOST = process.env.RUNNER_HOST || '127.0.0.1';
const jobTypes = new Set(['browser', 'api', 'map', 'places', 'pharmacy', 'download', 'parse', 'ocr', 'transform']);

const templates = {
  browser: {
    url: 'https://example.com',
    waitUntil: 'domcontentloaded',
    timeoutMs: 45000,
    fields: { title: { selector: 'h1' }, links: { selector: 'a', attribute: 'href', all: true } },
    actions: [],
    screenshot: true,
    fullPage: true,
    maxPages: 1,
  },
  api: {
    url: 'https://api.example.com/data',
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: null,
    responseType: 'json',
    timeoutMs: 45000,
  },
  map: {
    url: 'https://example.com/data.geojson',
    headers: { Accept: 'application/geo+json, application/json' },
    featuresPath: 'features',
    timeoutMs: 45000,
  },
  places: {
    countryCode: 'US',
    zipCodes: ['60601', '60602'],
    zipText: '',
    zipFile: '',
    segments: [
      {
        name: 'Restaurants rated 4+',
        includedTypes: ['restaurant'],
        operatingStatus: ['OPERATING_STATUS_OPERATIONAL'],
        minRating: 4,
        includePlaceIds: true,
      },
      {
        name: 'Retail stores',
        includedTypes: ['store'],
        operatingStatus: ['OPERATING_STATUS_OPERATIONAL'],
        includePlaceIds: false,
      },
    ],
    includePlaceIds: false,
    maxRequestsPerRun: 250,
    delayMs: 250,
    timeoutMs: 45000,
    retries: 3,
    retentionDays: 30,
    resume: true,
  },
  pharmacy: {
    nppesFile: 'auto',
    autoDownload: true,
    keepArchive: false,
    enrichmentFile: '',
    columnMapFile: 'config/pharmacy-column-map.example.json',
    outputDirectory: 'data/pharmacies',
    zipStart: '00100',
    zipEnd: '99999',
  },
  download: {
    url: 'https://example.com/file.pdf',
    filename: 'file.pdf',
    timeoutMs: 120000,
  },
  parse: {
    inputPath: 'downloads/example.csv',
    format: 'auto',
    columns: true,
    path: '',
  },
  ocr: {
    input: 'downloads/scan.png',
    language: 'eng',
  },
  transform: {
    inputPath: 'data/outputs/example.json',
    path: 'result.data',
    pickFields: [],
    distinctBy: '',
    sortBy: '',
    descending: false,
    limit: 1000,
  },
};

const store = await createStore();
const pool = new RunnerPool(store.getSettings());
const activity = [];
const cleanupGoogleOutputs = () => cleanupExpiredGooglePlacesOutputs().catch((error) => {
  console.warn(`Google Places output cleanup failed: ${error.message}`);
});
void cleanupGoogleOutputs();
const googleOutputCleanupTimer = setInterval(cleanupGoogleOutputs, 60 * 60 * 1000);
googleOutputCleanupTimer.unref();

function recordActivity(event) {
  activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...event });
  activity.splice(100);
}

const getRunLogs = (runId) => store.getRun(runId)?.logs ?? [];

pool.on('started', ({ run, job }) => {
  void (async () => {
    const startedAt = new Date().toISOString();
    await store.updateRun(run.id, { status: 'running', progress: 2, startedAt });
    await store.updateJob(job.id, { status: 'running', lastRunId: run.id });
    recordActivity({ kind: 'started', runId: run.id, jobId: job.id, jobName: job.name, message: `${job.name} started` });
  })();
});

pool.on('message', ({ run, job, message }) => {
  void (async () => {
    if (message.type === 'progress') {
      await store.updateRun(run.id, { progress: message.progress, message: message.message }, false);
    } else if (message.type === 'log') {
      const logs = [...getRunLogs(run.id), { at: message.at, level: message.level, message: message.message }].slice(-100);
      await store.updateRun(run.id, { logs }, false);
    }
    if (['progress', 'log'].includes(message.type)) {
      recordActivity({ kind: message.type, runId: run.id, jobId: job.id, jobName: job.name, message: message.message, progress: message.progress });
    }
  })();
});

pool.on('completed', ({ run, job, message }) => {
  void (async () => {
    const completedAt = new Date().toISOString();
    await store.updateRun(run.id, {
      status: 'completed',
      progress: 100,
      completedAt,
      outputPath: message.outputPath,
      summary: message.summary,
      message: 'Completed',
    });
    await store.updateJob(job.id, { status: 'completed', lastRunId: run.id, lastRunAt: completedAt, lastError: null });
    recordActivity({ kind: 'completed', runId: run.id, jobId: job.id, jobName: job.name, message: `${job.name} completed` });
  })();
});

pool.on('failed', ({ run, job, message }) => {
  void (async () => {
    const completedAt = new Date().toISOString();
    await store.updateRun(run.id, { status: 'failed', completedAt, error: message.error, message: message.error });
    await store.updateJob(job.id, { status: 'failed', lastRunId: run.id, lastRunAt: completedAt, lastError: message.error });
    recordActivity({ kind: 'failed', runId: run.id, jobId: job.id, jobName: job.name, message: message.error });
  })();
});

pool.on('cancelled', ({ run, job }) => {
  void (async () => {
    const completedAt = new Date().toISOString();
    await store.updateRun(run.id, { status: 'cancelled', completedAt, message: 'Cancelled' });
    await store.updateJob(job.id, { status: 'cancelled', lastRunId: run.id, lastRunAt: completedAt });
    recordActivity({ kind: 'cancelled', runId: run.id, jobId: job.id, jobName: job.name, message: `${job.name} cancelled` });
  })();
});

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin === 'null') {
    response.setHeader('Access-Control-Allow-Origin', 'null');
  } else if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function validateJob(input) {
  if (!jobTypes.has(input.type)) throw Object.assign(new Error('Unsupported job type.'), { statusCode: 400 });
  if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) {
    throw Object.assign(new Error('Job config must be a JSON object.'), { statusCode: 400 });
  }
}

const server = http.createServer(async (request, response) => {
  setCors(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      const pharmacySource = await inspectNppesSource();
      json(response, 200, {
        ok: true,
        runner: 'Co*Tive Collector',
        node: process.version,
        logicalCpus: cpus().length,
        pool: pool.stats(),
        services: {
          googleMaps: { configured: Boolean(process.env.GOOGLE_MAPS_API_KEY) },
          pharmacySource,
        },
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/templates') {
      json(response, 200, templates);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/jobs') {
      json(response, 200, store.getJobs());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/jobs') {
      const input = await bodyJson(request);
      validateJob(input);
      json(response, 201, await store.createJob(input));
      return;
    }

    if (segments[0] === 'api' && segments[1] === 'jobs' && segments[2]) {
      const jobId = segments[2];
      const existing = store.getJob(jobId);
      if (!existing) {
        json(response, 404, { error: 'Job not found.' });
        return;
      }
      if (request.method === 'PUT') {
        const input = await bodyJson(request);
        validateJob({ ...existing, ...input });
        json(response, 200, await store.updateJob(jobId, {
          name: input.name,
          type: input.type,
          enabled: input.enabled,
          config: input.config,
        }));
        return;
      }
      if (request.method === 'DELETE') {
        if (['running', 'queued'].includes(existing.status)) {
          json(response, 409, { error: 'Cancel the active run before deleting this job.' });
          return;
        }
        await store.deleteJob(jobId);
        response.writeHead(204);
        response.end();
        return;
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/runs') {
      json(response, 200, store.getRuns(Math.min(500, Number(url.searchParams.get('limit')) || 100)));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/runs') {
      const input = await bodyJson(request);
      const ids = Array.isArray(input.jobIds) && input.jobIds.length
        ? input.jobIds
        : store.getJobs().filter((job) => job.enabled).map((job) => job.id);
      const runs = [];
      for (const id of [...new Set(ids)]) {
        const job = store.getJob(id);
        if (!job) continue;
        const run = await store.createRun(job);
        await store.updateJob(job.id, { status: 'queued', lastRunId: run.id });
        pool.enqueue(run, job);
        runs.push(run);
      }
      json(response, 202, { runs });
      return;
    }

    if (segments[0] === 'api' && segments[1] === 'runs' && segments[2] && segments[3] === 'cancel' && request.method === 'POST') {
      const cancelled = await pool.cancel(segments[2]);
      json(response, cancelled ? 200 : 404, cancelled ? { cancelled: true } : { error: 'Active run not found.' });
      return;
    }

    if (segments[0] === 'api' && segments[1] === 'runs' && segments[2] && segments[3] === 'output' && request.method === 'GET') {
      const run = store.getRun(segments[2]);
      if (!run?.outputPath) {
        json(response, 404, { error: 'Output not found.' });
        return;
      }
      const content = await readFile(resolveAppPath(run.outputPath));
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': content.length,
        'Content-Disposition': `attachment; filename="${run.id}.json"`,
      });
      response.end(content);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/activity') {
      json(response, 200, activity.slice(0, Math.min(100, Number(url.searchParams.get('limit')) || 30)));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/settings') {
      json(response, 200, { ...store.getSettings(), effectiveConcurrency: pool.stats().concurrency });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/settings') {
      const input = await bodyJson(request);
      const concurrency = pool.setConcurrency(input.concurrency);
      json(response, 200, await store.updateSettings({ concurrency }));
      return;
    }

    json(response, 404, { error: 'Route not found.' });
  } catch (error) {
    const status = error.statusCode || 500;
    json(response, status, { error: status === 500 ? `Runner error: ${error.message}` : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Co*Tive Collector listening at http://${HOST}:${PORT}`);
});

async function shutdown() {
  clearInterval(googleOutputCleanupTimer);
  server.close();
  await pool.close();
  await store.flush();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
