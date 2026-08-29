import { createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { chromium } from 'playwright';
import { parse as parseCsv } from 'csv-parse/sync';
import { createWorker as createOcrWorker } from 'tesseract.js';
import {
  DOWNLOAD_DIR,
  OCR_CACHE_DIR,
  OUTPUT_DIR,
  SCREENSHOT_DIR,
  TEMP_DIR,
  relativeToApp,
  resolveAppPath,
} from './paths.mjs';

const { job, runId } = workerData;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

const send = (type, payload = {}) => parentPort.postMessage({ type, at: new Date().toISOString(), ...payload });
const progress = (value, message) => send('progress', { progress: Math.max(0, Math.min(100, Math.round(value))), message });
const log = (message, level = 'info') => send('log', { message, level });

function assertHttpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  return url.toString();
}

function safeName(value, fallback) {
  const normalized = path.basename(value || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
  return normalized || fallback;
}

function getPath(value, expression) {
  if (!expression) return value;
  return expression.split('.').filter(Boolean).reduce((current, key) => current?.[key], value);
}

async function fetchBuffer(url, options = {}) {
  const response = await fetch(assertHttpUrl(url), {
    ...options,
    signal: AbortSignal.timeout(Number(job.config.timeoutMs) || 45_000),
  });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error('Response exceeds the 50 MB safety limit.');
  const chunks = [];
  let received = 0;
  if (response.body) {
    for await (const chunk of Readable.fromWeb(response.body)) {
      received += chunk.length;
      if (received > MAX_RESPONSE_BYTES) throw new Error('Response exceeds the 50 MB safety limit.');
      chunks.push(Buffer.from(chunk));
    }
  }
  const buffer = Buffer.concat(chunks);
  return { response, buffer };
}

async function writeResult(result) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${runId}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return relativeToApp(outputPath);
}

async function executeBrowser() {
  const config = job.config;
  const browser = await chromium.launch({ headless: config.headless !== false });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: config.viewport ?? { width: 1440, height: 1000 },
    userAgent: config.userAgent || undefined,
    extraHTTPHeaders: config.headers || undefined,
  });
  const page = await context.newPage();
  const pages = [];
  try {
    progress(8, 'Chromium launched');
    await page.goto(assertHttpUrl(config.url), {
      waitUntil: config.waitUntil || 'domcontentloaded',
      timeout: Number(config.timeoutMs) || 45_000,
    });
    progress(28, 'Target page loaded');

    if (config.waitForSelector) {
      await page.locator(config.waitForSelector).first().waitFor({ timeout: Number(config.timeoutMs) || 45_000 });
    }

    for (const action of config.actions ?? []) {
      if (action.type === 'click') await page.locator(action.selector).first().click();
      else if (action.type === 'fill') await page.locator(action.selector).first().fill(String(action.value ?? ''));
      else if (action.type === 'press') await page.locator(action.selector).first().press(String(action.value));
      else if (action.type === 'select') await page.locator(action.selector).first().selectOption(action.value);
      else if (action.type === 'wait') await page.waitForTimeout(Math.min(10_000, Number(action.value) || 500));
      else if (action.type === 'waitFor') await page.locator(action.selector).first().waitFor();
    }

    const maxPages = Math.max(1, Math.min(100, Number(config.maxPages) || 1));
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const values = {};
      for (const [key, fieldValue] of Object.entries(config.fields ?? { title: { selector: 'title' } })) {
        const field = typeof fieldValue === 'string' ? { selector: fieldValue } : fieldValue;
        const locator = page.locator(field.selector);
        const count = await locator.count();
        const read = async (index) => field.attribute
          ? locator.nth(index).getAttribute(field.attribute)
          : locator.nth(index).innerText().catch(() => locator.nth(index).textContent());
        values[key] = field.all
          ? await Promise.all(Array.from({ length: count }, (_, index) => read(index)))
          : count ? await read(0) : null;
      }
      pages.push({ page: pageNumber, url: page.url(), values });
      progress(45 + (pageNumber / maxPages) * 35, `Extracted page ${pageNumber}`);

      if (!config.nextSelector || pageNumber === maxPages) break;
      const next = page.locator(config.nextSelector).first();
      if (!(await next.count()) || !(await next.isVisible())) break;
      await Promise.all([
        page.waitForLoadState(config.waitUntil || 'domcontentloaded').catch(() => undefined),
        next.click(),
      ]);
    }

    let screenshotPath = null;
    if (config.screenshot) {
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      const absolute = path.join(SCREENSHOT_DIR, `${runId}.png`);
      await page.screenshot({ path: absolute, fullPage: config.fullPage !== false });
      screenshotPath = relativeToApp(absolute);
    }
    return { kind: 'browser', source: config.url, pages, screenshotPath };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function executeApi() {
  const config = job.config;
  const headers = { ...(config.headers ?? {}) };
  let body = config.body;
  if (body && typeof body !== 'string') {
    body = JSON.stringify(body);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  }
  progress(15, 'Sending API request');
  const { response, buffer } = await fetchBuffer(config.url, {
    method: config.method || 'GET',
    headers,
    body: ['GET', 'HEAD'].includes((config.method || 'GET').toUpperCase()) ? undefined : body,
  });
  progress(70, `Received HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const text = buffer.toString('utf8');
  let data = text;
  if (contentType.includes('json') || config.responseType === 'json') data = JSON.parse(text);
  return {
    kind: 'api',
    source: config.url,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

function updateBounds(coordinates, bounds) {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && coordinates.every((value) => typeof value === 'number')) {
    const [x, y] = coordinates;
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
    return;
  }
  for (const child of coordinates) updateBounds(child, bounds);
}

async function executeMap() {
  progress(15, 'Pulling map data');
  const { response, buffer } = await fetchBuffer(job.config.url, { headers: job.config.headers ?? {} });
  const data = JSON.parse(buffer.toString('utf8'));
  const features = getPath(data, job.config.featuresPath) ?? data.features ?? (Array.isArray(data) ? data : []);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) updateBounds(feature?.geometry?.coordinates, bounds);
  progress(78, `Parsed ${features.length ?? 0} map features`);
  return {
    kind: 'map',
    source: job.config.url,
    status: response.status,
    summary: {
      featureCount: features.length ?? 0,
      geometryTypes: [...new Set(features.map((feature) => feature?.geometry?.type).filter(Boolean))],
      bounds: bounds.every(Number.isFinite) ? bounds : null,
    },
    data,
  };
}

async function executeDownload() {
  const config = job.config;
  const response = await fetch(assertHttpUrl(config.url), { signal: AbortSignal.timeout(Number(config.timeoutMs) || 120_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}.`);
  const size = Number(response.headers.get('content-length') || 0);
  if (size > MAX_RESPONSE_BYTES) throw new Error('Download exceeds the 50 MB safety limit.');
  const filename = safeName(config.filename || new URL(config.url).pathname, `download-${runId}.bin`);
  const destination = path.join(DOWNLOAD_DIR, `${runId}-${filename}`);
  let received = 0;
  const limitStream = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_RESPONSE_BYTES) callback(new Error('Download exceeds the 50 MB safety limit.'));
      else callback(null, chunk);
    },
  });
  progress(20, 'Download started');
  try {
    await pipeline(Readable.fromWeb(response.body), limitStream, createWriteStream(destination));
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
  progress(85, 'Download written');
  return { kind: 'download', source: config.url, file: relativeToApp(destination), bytes: received };
}

async function executeParse() {
  const config = job.config;
  const inputPath = resolveAppPath(config.inputPath);
  const content = await readFile(inputPath, 'utf8');
  const extension = path.extname(inputPath).toLowerCase();
  const format = config.format === 'auto' || !config.format
    ? extension === '.json' || extension === '.geojson' ? 'json' : extension === '.csv' ? 'csv' : 'text'
    : config.format;
  progress(30, `Parsing ${format.toUpperCase()}`);
  let data;
  if (format === 'json') data = JSON.parse(content);
  else if (format === 'csv') data = parseCsv(content, { columns: config.columns !== false, skip_empty_lines: true, relax_column_count: true });
  else data = config.splitLines === false ? content : content.split(/\r?\n/).filter(Boolean);
  const selected = getPath(data, config.path);
  progress(80, `Parsed ${Array.isArray(selected) ? selected.length : 1} item(s)`);
  return { kind: 'parse', source: relativeToApp(inputPath), format, data: selected };
}

async function executeOcr() {
  const config = job.config;
  let inputPath;
  let removeAfter = false;
  if (/^https?:\/\//i.test(config.input)) {
    const { buffer } = await fetchBuffer(config.input);
    inputPath = path.join(TEMP_DIR, `${runId}-${safeName(new URL(config.input).pathname, 'ocr-image.png')}`);
    await writeFile(inputPath, buffer);
    removeAfter = true;
  } else {
    inputPath = resolveAppPath(config.input);
  }

  await mkdir(OCR_CACHE_DIR, { recursive: true });
  const worker = await createOcrWorker(config.language || 'eng', 1, {
    cachePath: OCR_CACHE_DIR,
    logger: (message) => {
      if (typeof message.progress === 'number') progress(15 + message.progress * 70, message.status || 'Recognizing text');
    },
  });
  try {
    const result = await worker.recognize(inputPath);
    return {
      kind: 'ocr',
      source: /^https?:\/\//i.test(config.input) ? config.input : relativeToApp(inputPath),
      language: config.language || 'eng',
      confidence: result.data.confidence,
      text: result.data.text,
      words: result.data.words?.map(({ text, confidence, bbox }) => ({ text, confidence, bbox })) ?? [],
    };
  } finally {
    await worker.terminate();
    if (removeAfter) await unlink(inputPath).catch(() => undefined);
  }
}

async function executeTransform() {
  const config = job.config;
  const inputPath = resolveAppPath(config.inputPath);
  const source = JSON.parse(await readFile(inputPath, 'utf8'));
  let data = getPath(source, config.path);
  if (!Array.isArray(data)) data = [data];
  progress(35, `Loaded ${data.length} records`);
  if (config.distinctBy) {
    const seen = new Set();
    data = data.filter((item) => {
      const value = getPath(item, config.distinctBy);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  if (config.sortBy) {
    data.sort((left, right) => String(getPath(left, config.sortBy) ?? '').localeCompare(String(getPath(right, config.sortBy) ?? '')));
    if (config.descending) data.reverse();
  }
  if (Array.isArray(config.pickFields) && config.pickFields.length) {
    data = data.map((item) => Object.fromEntries(config.pickFields.map((field) => [field, getPath(item, field)])));
  }
  if (config.limit) data = data.slice(0, Math.max(0, Number(config.limit)));
  progress(85, `Transformed ${data.length} records`);
  return { kind: 'transform', source: relativeToApp(inputPath), data };
}

const handlers = {
  browser: executeBrowser,
  api: executeApi,
  map: executeMap,
  download: executeDownload,
  parse: executeParse,
  ocr: executeOcr,
  transform: executeTransform,
};

try {
  const handler = handlers[job.type];
  if (!handler) throw new Error(`Unsupported job type: ${job.type}`);
  log(`Starting ${job.type} job: ${job.name}`);
  const result = await handler();
  progress(92, 'Saving output');
  const outputPath = await writeResult({ runId, jobId: job.id, completedAt: new Date().toISOString(), result });
  send('completed', {
    progress: 100,
    outputPath,
    summary: result.summary ?? {
      kind: result.kind,
      items: Array.isArray(result.data) ? result.data.length : Array.isArray(result.pages) ? result.pages.length : 1,
    },
  });
} catch (error) {
  send('failed', { error: error instanceof Error ? error.message : String(error) });
}
