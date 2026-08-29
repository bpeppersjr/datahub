import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { CHECKPOINT_DIR, OUTPUT_DIR, resolveAppPath } from './paths.mjs';

const GEOCODING_ENDPOINT = 'https://geocode.googleapis.com/v4/geocode/address';
const AGGREGATE_ENDPOINT = 'https://areainsights.googleapis.com/v1:computeInsights';
const MAX_ZIP_CODES = 50_000;
const MAX_SEGMENTS = 50;
const MAX_REQUESTS = 5_000_000;
const MAX_RETENTION_DAYS = 30;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeZip(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99_999) {
    return String(value).padStart(5, '0');
  }
  const match = String(value ?? '').trim().match(/^(\d{5})(?:-\d{4})?$/);
  return match?.[1] ?? null;
}

function extractZipValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return value.zipCodes ?? value.zips ?? value.postalCodes ?? [];
  }
  return [];
}

async function readZipFile(filename) {
  const absolute = resolveAppPath(filename);
  const content = await readFile(absolute, 'utf8');
  if (path.extname(absolute).toLowerCase() === '.json') return extractZipValues(JSON.parse(content));
  if (path.extname(absolute).toLowerCase() === '.csv') {
    const rows = parseCsv(content, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });
    const keys = ['zip', 'zipcode', 'zip_code', 'postalcode', 'postal_code'];
    const values = rows.map((row) => {
      const entry = Object.entries(row).find(([key]) => keys.includes(key.toLowerCase().replaceAll(' ', '_')));
      return entry?.[1];
    }).filter(Boolean);
    if (values.length) return values;
  }
  return content.split(/[\s,;]+/).filter(Boolean);
}

export async function loadZipCodes(config) {
  const values = [
    ...extractZipValues(config.zipCodes),
    ...String(config.zipText ?? '').split(/[\s,;]+/).filter(Boolean),
    ...(config.zipFile ? await readZipFile(config.zipFile) : []),
  ];
  const invalid = values.filter((value) => !normalizeZip(value));
  if (invalid.length) throw new Error(`Invalid ZIP code input: ${String(invalid[0])}`);
  const zipCodes = [...new Set(values.map(normalizeZip))];
  if (!zipCodes.length) throw new Error('Add at least one ZIP code using zipCodes, zipText, or zipFile.');
  if (zipCodes.length > MAX_ZIP_CODES) throw new Error(`A ZIP segment job supports up to ${MAX_ZIP_CODES.toLocaleString('en-US')} ZIP codes.`);
  return zipCodes;
}

function normalizeSegments(value, defaultIncludePlaceIds) {
  if (!Array.isArray(value) || !value.length) throw new Error('Add at least one segment definition.');
  if (value.length > MAX_SEGMENTS) throw new Error(`A ZIP segment job supports up to ${MAX_SEGMENTS} segments.`);
  const names = new Set();
  return value.map((segment, index) => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) throw new Error(`Segment ${index + 1} must be an object.`);
    const name = String(segment.name || `Segment ${index + 1}`).trim();
    if (names.has(name.toLowerCase())) throw new Error(`Segment names must be unique: ${name}`);
    names.add(name.toLowerCase());
    const includedTypes = stringArray(segment.includedTypes);
    const includedPrimaryTypes = stringArray(segment.includedPrimaryTypes);
    if (!includedTypes.length && !includedPrimaryTypes.length) {
      throw new Error(`${name} must include includedTypes or includedPrimaryTypes.`);
    }
    const minRating = segment.minRating === undefined || segment.minRating === null || segment.minRating === '' ? null : Number(segment.minRating);
    const maxRating = segment.maxRating === undefined || segment.maxRating === null || segment.maxRating === '' ? null : Number(segment.maxRating);
    if (minRating !== null && (minRating < 1 || minRating > 5)) throw new Error(`${name} minRating must be between 1 and 5.`);
    if (maxRating !== null && (maxRating < 1 || maxRating > 5)) throw new Error(`${name} maxRating must be between 1 and 5.`);
    if (minRating !== null && maxRating !== null && minRating > maxRating) throw new Error(`${name} minRating cannot exceed maxRating.`);
    return {
      name,
      includedTypes,
      excludedTypes: stringArray(segment.excludedTypes),
      includedPrimaryTypes,
      excludedPrimaryTypes: stringArray(segment.excludedPrimaryTypes),
      operatingStatus: stringArray(segment.operatingStatus),
      priceLevels: stringArray(segment.priceLevels),
      minRating,
      maxRating,
      includePlaceIds: segment.includePlaceIds ?? defaultIncludePlaceIds,
    };
  });
}

function integerInRange(value, fallback, minimum, maximum, label) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export async function normalizeGooglePlacesConfig(config) {
  const zipCodes = await loadZipCodes(config);
  const countryCode = String(config.countryCode || 'US').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('countryCode must be a two-letter country code.');
  const segments = normalizeSegments(config.segments, config.includePlaceIds === true);
  const maxRequestsPerRun = integerInRange(config.maxRequestsPerRun, 1000, 1, MAX_REQUESTS, 'maxRequestsPerRun');
  const segmentRequests = segments.length + segments.filter((segment) => segment.includePlaceIds).length;
  const estimatedRequests = zipCodes.length * (segmentRequests + 1);
  if (estimatedRequests > maxRequestsPerRun) {
    throw new Error(`This job needs up to ${estimatedRequests.toLocaleString('en-US')} requests, above its ${maxRequestsPerRun.toLocaleString('en-US')} request budget.`);
  }
  return {
    zipCodes,
    countryCode,
    segments,
    estimatedRequests,
    maxRequestsPerRun,
    delayMs: integerInRange(config.delayMs, 250, 0, 60_000, 'delayMs'),
    timeoutMs: integerInRange(config.timeoutMs, 45_000, 1000, 120_000, 'timeoutMs'),
    retries: integerInRange(config.retries, 3, 0, 5, 'retries'),
    retentionDays: integerInRange(config.retentionDays, 30, 1, MAX_RETENTION_DAYS, 'retentionDays'),
    resume: config.resume !== false,
  };
}

function aggregateBody(zipPlaceId, segment, insight) {
  const typeFilter = {};
  for (const key of ['includedTypes', 'excludedTypes', 'includedPrimaryTypes', 'excludedPrimaryTypes']) {
    if (segment[key].length) typeFilter[key] = segment[key];
  }
  const filter = {
    locationFilter: { region: { place: `places/${zipPlaceId}` } },
    typeFilter,
  };
  if (segment.operatingStatus.length) filter.operatingStatus = segment.operatingStatus;
  if (segment.priceLevels.length) filter.priceLevels = segment.priceLevels;
  if (segment.minRating !== null || segment.maxRating !== null) {
    filter.ratingFilter = {};
    if (segment.minRating !== null) filter.ratingFilter.minRating = segment.minRating;
    if (segment.maxRating !== null) filter.ratingFilter.maxRating = segment.maxRating;
  }
  return {
    insights: [insight],
    filter,
  };
}

function errorMessage(payload, status) {
  return payload?.error?.message || payload?.error_message || payload?.status || `Google Maps Platform returned HTTP ${status}.`;
}

async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

async function readCheckpoint(file, signature, retentionDays) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    const oldestAllowed = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    if (value.signature === signature && Date.parse(value.updatedAt) >= oldestAllowed) return value;
    await unlink(file).catch(() => undefined);
  } catch (error) {
    if (error.code !== 'ENOENT') await unlink(file).catch(() => undefined);
  }
  return null;
}

export async function collectGooglePlacesByZip({
  config,
  jobId,
  apiKey,
  fetchImpl = fetch,
  onProgress = () => {},
  onLog = () => {},
  checkpointFile,
}) {
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured. Add it to datahub/.env and restart the app.');
  const normalized = await normalizeGooglePlacesConfig(config);
  const signature = createHash('sha256').update(JSON.stringify({
    zipCodes: normalized.zipCodes,
    countryCode: normalized.countryCode,
    segments: normalized.segments,
  })).digest('hex');
  const resolvedCheckpoint = checkpointFile === undefined
    ? path.join(CHECKPOINT_DIR, `${String(jobId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
    : checkpointFile;
  const saved = normalized.resume && resolvedCheckpoint
    ? await readCheckpoint(resolvedCheckpoint, signature, normalized.retentionDays)
    : null;
  const state = saved ?? {
    signature,
    updatedAt: new Date().toISOString(),
    resolvedZipPlaceIds: {},
    completedSegments: [],
    rows: [],
  };
  const completedSegments = new Set(state.completedSegments);
  const totalSteps = normalized.zipCodes.length * (normalized.segments.length + 1);
  let completedSteps = Object.keys(state.resolvedZipPlaceIds).length + completedSegments.size;
  let requestCount = 0;
  let lastRequestAt = 0;

  const persist = async () => {
    if (!normalized.resume || !resolvedCheckpoint) return;
    state.updatedAt = new Date().toISOString();
    state.completedSegments = [...completedSegments];
    await atomicJson(resolvedCheckpoint, state);
  };

  const requestJson = async (url, options) => {
    for (let attempt = 0; attempt <= normalized.retries; attempt += 1) {
      const waitForPace = normalized.delayMs - (Date.now() - lastRequestAt);
      if (waitForPace > 0) await sleep(waitForPace);
      if (requestCount >= normalized.maxRequestsPerRun) throw new Error('The Google Maps request budget was exhausted.');
      requestCount += 1;
      lastRequestAt = Date.now();
      let response;
      try {
        response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(normalized.timeoutMs) });
      } catch (error) {
        if (attempt === normalized.retries) throw error;
        await sleep(Math.min(10_000, 500 * (2 ** attempt)));
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === normalized.retries) {
        throw new Error(errorMessage(payload, response.status));
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) ? Math.min(30_000, retryAfter * 1000) : Math.min(10_000, 500 * (2 ** attempt)));
    }
    throw new Error('Google Maps request failed.');
  };

  const updateProgress = (message) => {
    onProgress(5 + (completedSteps / Math.max(1, totalSteps)) * 83, message);
  };

  onLog(`Prepared ${normalized.zipCodes.length.toLocaleString('en-US')} ZIP codes and ${normalized.segments.length} segments (${normalized.estimatedRequests.toLocaleString('en-US')} planned requests).`);

  for (let zipIndex = 0; zipIndex < normalized.zipCodes.length; zipIndex += 1) {
    const zipCode = normalized.zipCodes[zipIndex];
    if (!Object.hasOwn(state.resolvedZipPlaceIds, zipCode)) {
      const address = encodeURIComponent(`${zipCode} ${normalized.countryCode}`);
      const url = `${GEOCODING_ENDPOINT}/${address}?regionCode=${encodeURIComponent(normalized.countryCode)}`;
      const payload = await requestJson(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'results.placeId,results.types',
        },
      });
      const match = payload.results?.find((result) => result.types?.includes('postal_code')) ?? payload.results?.[0];
      state.resolvedZipPlaceIds[zipCode] = match?.placeId ?? null;
      completedSteps += 1;
      onLog(match?.placeId ? `Resolved ZIP ${zipCode}.` : `No Google region was found for ZIP ${zipCode}.`, match?.placeId ? 'info' : 'warn');
      updateProgress(`Resolved ZIP ${zipIndex + 1} of ${normalized.zipCodes.length}`);
      await persist();
    }

    const zipPlaceId = state.resolvedZipPlaceIds[zipCode];
    for (const segment of normalized.segments) {
      const key = `${zipCode}\u0000${segment.name}`;
      if (completedSegments.has(key)) continue;
      if (!zipPlaceId) {
        completedSegments.add(key);
        completedSteps += 1;
        updateProgress(`Skipped ${segment.name} for unresolved ZIP ${zipCode}`);
        continue;
      }
      const payload = await requestJson(AGGREGATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(aggregateBody(zipPlaceId, segment, 'INSIGHT_COUNT')),
      });
      let placeIds = [];
      const count = String(payload.count ?? '0');
      if (segment.includePlaceIds && /^\d+$/.test(count) && BigInt(count) <= 100n) {
        const placesPayload = await requestJson(AGGREGATE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
          },
          body: JSON.stringify(aggregateBody(zipPlaceId, segment, 'INSIGHT_PLACES')),
        });
        placeIds = (placesPayload.placeInsights ?? []).map((item) => String(item.place ?? '').replace(/^places\//, '')).filter(Boolean);
      }
      state.rows.push({
        zipCode,
        zipPlaceId,
        segment: segment.name,
        count,
        placeIds,
      });
      completedSegments.add(key);
      completedSteps += 1;
      updateProgress(`${zipCode}: ${segment.name}`);
      await persist();
    }
  }

  if (resolvedCheckpoint) await unlink(resolvedCheckpoint).catch(() => undefined);
  const generatedAt = new Date();
  const uniquePlaceIds = new Set(state.rows.flatMap((row) => row.placeIds));
  const unresolvedZipCodes = normalized.zipCodes.filter((zipCode) => !state.resolvedZipPlaceIds[zipCode]);
  return {
    kind: 'google_places_zip',
    provider: 'Google Maps Platform',
    source: 'Places Aggregate API',
    generatedAt: generatedAt.toISOString(),
    expiresAt: new Date(generatedAt.getTime() + normalized.retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    retentionDays: normalized.retentionDays,
    requestCount,
    estimatedRequests: normalized.estimatedRequests,
    zipCodes: normalized.zipCodes,
    segments: normalized.segments,
    unresolvedZipCodes,
    rows: state.rows,
    attribution: 'Google Maps',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
    summary: {
      items: state.rows.length,
      zipCodes: normalized.zipCodes.length,
      segments: normalized.segments.length,
      placeIds: uniquePlaceIds.size,
      unresolvedZipCodes: unresolvedZipCodes.length,
    },
  };
}

export async function cleanupExpiredGooglePlacesOutputs(now = Date.now()) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  let removed = 0;
  for (const entry of await readdir(OUTPUT_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
    const filename = path.join(OUTPUT_DIR, entry.name);
    try {
      const payload = JSON.parse(await readFile(filename, 'utf8'));
      if (payload.result?.kind === 'google_places_zip' && Date.parse(payload.result.expiresAt) <= now) {
        await unlink(filename);
        removed += 1;
      }
    } catch {
      // Ignore unrelated or incomplete output files.
    }
  }
  return removed;
}
