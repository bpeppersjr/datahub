import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHECKPOINT_DIR, DATA_DIR, DOWNLOAD_DIR, OCR_CACHE_DIR, OUTPUT_DIR, SCREENSHOT_DIR, TEMP_DIR } from './paths.mjs';

const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const now = () => new Date().toISOString();

const seedJobs = () => [
  {
    id: randomUUID(),
    name: 'Example page scrape',
    type: 'browser',
    enabled: true,
    status: 'idle',
    config: {
      url: 'https://example.com',
      waitUntil: 'domcontentloaded',
      fields: {
        title: { selector: 'h1' },
        description: { selector: 'p' },
        links: { selector: 'a', attribute: 'href', all: true },
      },
      screenshot: true,
    },
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: randomUUID(),
    name: 'DataHub repository API',
    type: 'api',
    enabled: true,
    status: 'idle',
    config: {
      url: 'https://api.github.com/repos/bpeppersjr/datahub',
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
    },
    createdAt: now(),
    updatedAt: now(),
  },
];

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

export async function createStore() {
  await Promise.all([
    DATA_DIR,
    OUTPUT_DIR,
    SCREENSHOT_DIR,
    TEMP_DIR,
    CHECKPOINT_DIR,
    OCR_CACHE_DIR,
    DOWNLOAD_DIR,
  ].map((directory) => mkdir(directory, { recursive: true })));

  const initialJobs = await readJson(JOBS_FILE, null);
  let jobs = initialJobs ?? seedJobs();
  let runs = await readJson(RUNS_FILE, []);
  let settings = await readJson(SETTINGS_FILE, { concurrency: 4 });
  let writeChain = Promise.resolve();

  const queueWrite = (file, value) => {
    writeChain = writeChain.then(() => atomicWrite(file, value));
    return writeChain;
  };

  if (!initialJobs) await queueWrite(JOBS_FILE, jobs);

  return {
    getJobs: () => structuredClone(jobs),
    getJob: (id) => structuredClone(jobs.find((job) => job.id === id) ?? null),
    async createJob(input) {
      const timestamp = now();
      const job = {
        id: randomUUID(),
        name: input.name?.trim() || 'Untitled job',
        type: input.type,
        enabled: input.enabled !== false,
        status: 'idle',
        config: input.config ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      jobs.unshift(job);
      await queueWrite(JOBS_FILE, jobs);
      return structuredClone(job);
    },
    async updateJob(id, patch) {
      const index = jobs.findIndex((job) => job.id === id);
      if (index < 0) return null;
      jobs[index] = {
        ...jobs[index],
        ...patch,
        id,
        config: patch.config ?? jobs[index].config,
        updatedAt: now(),
      };
      await queueWrite(JOBS_FILE, jobs);
      return structuredClone(jobs[index]);
    },
    async deleteJob(id) {
      const before = jobs.length;
      jobs = jobs.filter((job) => job.id !== id);
      if (jobs.length === before) return false;
      await queueWrite(JOBS_FILE, jobs);
      return true;
    },
    getRuns: (limit = 100) => structuredClone(runs.slice(0, limit)),
    getRun: (id) => structuredClone(runs.find((run) => run.id === id) ?? null),
    async createRun(job) {
      const run = {
        id: randomUUID(),
        jobId: job.id,
        jobName: job.name,
        type: job.type,
        status: 'queued',
        progress: 0,
        logs: [],
        queuedAt: now(),
      };
      runs.unshift(run);
      runs = runs.slice(0, 500);
      await queueWrite(RUNS_FILE, runs);
      return structuredClone(run);
    },
    async updateRun(id, patch, persist = true) {
      const index = runs.findIndex((run) => run.id === id);
      if (index < 0) return null;
      runs[index] = { ...runs[index], ...patch };
      if (persist) await queueWrite(RUNS_FILE, runs);
      return structuredClone(runs[index]);
    },
    getSettings: () => structuredClone(settings),
    async updateSettings(patch) {
      settings = { ...settings, ...patch };
      await queueWrite(SETTINGS_FILE, settings);
      return structuredClone(settings);
    },
    flush: () => writeChain,
  };
}
