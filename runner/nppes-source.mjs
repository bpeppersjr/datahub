import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import { APP_ROOT, assertInsideApp, relativeToApp, resolveAppPath } from './paths.mjs';

export const CMS_NPI_FILES_PAGE = 'https://download.cms.gov/nppes/NPI_Files.html';

const LOCK_STALE_MS = 6 * 60 * 60 * 1000;
const LOCK_WAIT_MS = 3 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const DISK_RESERVE_BYTES = 1024 * 1024 * 1024;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sourcePaths(rootDirectory) {
  const root = assertInsideApp(rootDirectory ?? path.join(APP_ROOT, 'data', 'pharmacy-sources'));
  return {
    root,
    active: path.join(root, 'nppes'),
    lock: path.join(root, 'nppes-source.lock'),
  };
}

function findMonthlyV2Href(html) {
  const tags = html.match(/<a\b[^>]*>/gi) ?? [];
  const monthlyTag = tags.find((tag) => /\bid\s*=\s*["']DDSMTH\.ZIP\.D["']/i.test(tag));
  const href = monthlyTag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? html.match(/\bhref\s*=\s*["']([^"']*NPPES_Data_Dissemination_[^"']*_V2\.zip)["']/i)?.[1];
  if (!href || !/_V2\.zip(?:$|[?#])/i.test(href)) {
    throw new Error('CMS did not publish a discoverable monthly NPPES V2 archive link.');
  }
  return href.replaceAll('&amp;', '&');
}

export async function discoverCurrentNppesRelease({
  fetchImpl = fetch,
  pageUrl = CMS_NPI_FILES_PAGE,
} = {}) {
  const response = await fetchImpl(pageUrl, {
    headers: { Accept: 'text/html', 'User-Agent': 'CoTive-Collector/0.1' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`CMS NPPES release discovery failed with HTTP ${response.status}.`);
  const sourceUrl = new URL(findMonthlyV2Href(await response.text()), pageUrl).toString();
  const archiveName = path.basename(decodeURIComponent(new URL(sourceUrl).pathname)).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!archiveName.toLowerCase().endsWith('_v2.zip')) throw new Error('CMS returned an unexpected NPPES archive name.');
  return {
    sourcePage: pageUrl,
    sourceUrl,
    archiveName,
    releaseId: archiveName.replace(/\.zip$/i, ''),
  };
}

async function availableBytes(directory) {
  const fileSystem = await statfs(directory, { bigint: true });
  return fileSystem.bavail * fileSystem.bsize;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

async function assertFreeSpace(directory, requiredBytes, operation) {
  const free = await availableBytes(directory);
  const required = BigInt(Math.max(0, Number(requiredBytes) || 0));
  if (free < required) {
    throw new Error(`${operation} needs ${formatBytes(required)} free inside datahub; ${formatBytes(free)} is available.`);
  }
}

async function validCachedSource(activeDirectory) {
  try {
    const metadata = JSON.parse(await readFile(path.join(activeDirectory, 'source.json'), 'utf8'));
    const mainName = path.basename(String(metadata.mainFile ?? ''));
    if (!/^npidata_pfile.*\.csv$/i.test(mainName)) return null;
    const mainPath = path.join(activeDirectory, mainName);
    const details = await stat(mainPath);
    if (!details.isFile() || details.size <= 0) return null;
    const expectedBytes = Number(metadata.uncompressedBytes ?? 0);
    if (expectedBytes > 0 && details.size !== expectedBytes) return null;
    for (const file of metadata.files ?? []) {
      const filename = path.basename(String(file.file ?? ''));
      if (!filename || filename !== file.file) return null;
      const fileDetails = await stat(path.join(activeDirectory, filename));
      if (!fileDetails.isFile() || (Number(file.uncompressedBytes) > 0 && fileDetails.size !== Number(file.uncompressedBytes))) return null;
    }
    return {
      cached: true,
      inputPath: mainPath,
      inputPathRelative: relativeToApp(mainPath),
      metadata: { ...metadata, mainFile: mainName },
    };
  } catch {
    return null;
  }
}

export async function inspectNppesSource({ rootDirectory } = {}) {
  const { active } = sourcePaths(rootDirectory);
  const cached = await validCachedSource(active);
  if (!cached) return { cached: false, status: 'not-cached' };
  return {
    cached: true,
    status: 'cached',
    releaseId: cached.metadata.releaseId ?? null,
    readyAt: cached.metadata.readyAt ?? null,
    mainFile: cached.inputPathRelative,
    sourceUrl: cached.metadata.sourceUrl ?? null,
  };
}

async function acquireSourceLock(lockPath, onProgress) {
  const started = Date.now();
  let lastNotice = 0;
  while (Date.now() - started < LOCK_WAIT_MS) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const lockDetails = await stat(lockPath);
        let ownerAlive = true;
        try {
          const owner = JSON.parse(await readFile(lockPath, 'utf8'));
          if (!Number.isInteger(owner.pid) || owner.pid <= 0) ownerAlive = false;
          else {
            try {
              process.kill(owner.pid, 0);
            } catch (ownerError) {
              if (ownerError.code === 'ESRCH') ownerAlive = false;
              else if (ownerError.code !== 'EPERM') throw ownerError;
            }
          }
        } catch (ownerError) {
          if (ownerError.name === 'SyntaxError' || ownerError.code === 'ENOENT') ownerAlive = false;
          else throw ownerError;
        }
        if (!ownerAlive || Date.now() - lockDetails.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() - lastNotice > 10_000) {
        onProgress?.(2, 'Waiting for another job to prepare the CMS NPPES source');
        lastNotice = Date.now();
      }
      await sleep(1_000);
    }
  }
  throw new Error('Timed out waiting for another job to prepare the CMS NPPES source.');
}

async function downloadArchive({ release, destination, fetchImpl, onProgress }) {
  let resumedBytes = 0;
  try {
    resumedBytes = (await stat(destination)).size;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const headers = { Accept: 'application/zip, application/octet-stream', 'User-Agent': 'CoTive-Collector/0.1' };
  if (resumedBytes > 0) headers.Range = `bytes=${resumedBytes}-`;
  const response = await fetchImpl(release.sourceUrl, {
    headers,
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (response.status === 416 && resumedBytes > 0) {
    const total = Number(response.headers.get('content-range')?.match(/\*\/(\d+)$/)?.[1] ?? 0);
    if (total === resumedBytes) return { received: resumedBytes, downloadedThisAttempt: 0, expectedBytes: total, resumedBytes };
    const error = new Error('CMS rejected an invalid NPPES resume offset.');
    error.discardPartial = true;
    throw error;
  }
  if (!response.ok || !response.body) throw new Error(`CMS NPPES download failed with HTTP ${response.status}.`);
  let append = response.status === 206 && resumedBytes > 0;
  if (append) {
    const contentRange = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/i);
    if (!contentRange || Number(contentRange[1]) !== resumedBytes) {
      const error = new Error('CMS returned an invalid Content-Range for the NPPES resume request.');
      error.discardPartial = true;
      throw error;
    }
  } else if (resumedBytes > 0) {
    resumedBytes = 0;
  }
  const responseBytes = Number(response.headers.get('content-length') || 0);
  const rangeTotal = Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] ?? 0);
  const expectedBytes = rangeTotal || (responseBytes > 0 ? resumedBytes + responseBytes : 0);
  if (expectedBytes > 0) {
    await assertFreeSpace(path.dirname(destination), Math.max(0, expectedBytes - resumedBytes) + DISK_RESERVE_BYTES, 'The NPPES download');
  }
  let downloadedThisAttempt = 0;
  let lastReported = 0;
  const monitor = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedThisAttempt += chunk.length;
      const received = resumedBytes + downloadedThisAttempt;
      const now = Date.now();
      if (now - lastReported > 750) {
        const percent = expectedBytes > 0 ? Math.min(78, (received / expectedBytes) * 78) : 35;
        onProgress?.(5 + percent, `Downloading CMS NPPES V2 (${formatBytes(received)}${expectedBytes ? ` of ${formatBytes(expectedBytes)}` : ''})`);
        lastReported = now;
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), monitor, createWriteStream(destination, { flags: append ? 'a' : 'w' }));
  const received = resumedBytes + downloadedThisAttempt;
  if (expectedBytes > 0 && received !== expectedBytes) {
    throw new Error(`CMS NPPES download was incomplete: expected ${expectedBytes} bytes and received ${received}. The partial is retained for resume.`);
  }
  const header = Buffer.alloc(4);
  const archive = await open(destination, 'r');
  try {
    await archive.read(header, 0, header.length, 0);
  } finally {
    await archive.close();
  }
  if (header[0] !== 0x50 || header[1] !== 0x4b || ![0x03, 0x05, 0x07].includes(header[2])) {
    const error = new Error('CMS response was not a valid ZIP archive.');
    error.discardPartial = true;
    throw error;
  }
  return { received, downloadedThisAttempt, expectedBytes, resumedBytes };
}

async function adoptLegacyPartial(root, archiveName, destination) {
  try {
    await stat(destination);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const escaped = archiveName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\.${escaped}\\.\\d+\\.part$`);
  const candidates = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    const candidatePath = path.join(root, entry.name);
    candidates.push({ path: candidatePath, size: (await stat(candidatePath)).size });
  }
  candidates.sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));
  if (candidates[0]) await rename(candidates[0].path, destination);
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

function archiveDataEntries(directory) {
  const patterns = [
    { kind: 'main', pattern: /(^|[\\/])npidata_pfile[^\\/]*\.csv$/i },
    { kind: 'other-names', pattern: /(^|[\\/])othername_pfile[^\\/]*\.csv$/i },
    { kind: 'practice-locations', pattern: /(^|[\\/])pl_pfile[^\\/]*\.csv$/i },
    { kind: 'endpoints', pattern: /(^|[\\/])endpoint_pfile[^\\/]*\.csv$/i },
  ];
  return patterns.flatMap(({ kind, pattern }) => {
    const entry = directory.files.find((candidate) => pattern.test(String(candidate.path)));
    return entry ? [{ kind, entry }] : [];
  });
}

async function extractEntry({ entry, kind, staging, onProgress, progressStart, progressSpan }) {
  const filename = path.basename(entry.path);
  const uncompressedBytes = Number(entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0);
  let extracted = 0;
  let lastReported = 0;
  const monitor = new Transform({
    transform(chunk, _encoding, callback) {
      extracted += chunk.length;
      const now = Date.now();
      if (now - lastReported > 750) {
        const fraction = uncompressedBytes > 0 ? Math.min(1, extracted / uncompressedBytes) : 0.5;
        onProgress?.(progressStart + fraction * progressSpan, `Extracting ${filename} (${formatBytes(extracted)}${uncompressedBytes ? ` of ${formatBytes(uncompressedBytes)}` : ''})`);
        lastReported = now;
      }
      callback(null, chunk);
    },
  });
  const destination = path.join(staging, filename);
  await pipeline(await entry.stream(), monitor, createWriteStream(destination, { flags: 'wx' }));
  if (uncompressedBytes > 0 && extracted !== uncompressedBytes) {
    throw new Error(`NPPES extraction was incomplete for ${filename}: expected ${uncompressedBytes} bytes and extracted ${extracted}.`);
  }
  const hashed = await hashFile(destination);
  return { kind, file: filename, uncompressedBytes: extracted, sha256: hashed.sha256 };
}

async function activateStagingDirectory(staging, active) {
  const backup = `${active}.previous-${process.pid}-${crypto.randomUUID()}`;
  let hadActive = false;
  try {
    await rename(active, backup);
    hadActive = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(staging, active);
  } catch (error) {
    if (hadActive) await rename(backup, active).catch(() => undefined);
    throw error;
  }
  if (hadActive) await rm(backup, { recursive: true, force: true });
}

export async function ensureNppesSource({
  rootDirectory,
  fetchImpl = fetch,
  openArchive = (archivePath) => unzipper.Open.file(archivePath),
  keepArchive = false,
  onProgress,
  onLog,
} = {}) {
  const locations = sourcePaths(rootDirectory);
  await mkdir(locations.root, { recursive: true });
  const existing = await validCachedSource(locations.active);
  let release;
  onProgress?.(1, 'Checking the current CMS NPPES V2 release');
  try {
    release = await discoverCurrentNppesRelease({ fetchImpl });
  } catch (error) {
    if (existing) {
      onLog?.(`CMS release check failed; using cached ${existing.metadata.releaseId ?? 'NPPES V2'} source. ${error.message}`, 'warn');
      onProgress?.(100, 'Using cached CMS NPPES V2 source');
      return existing;
    }
    throw error;
  }
  if (existing?.metadata.sourceUrl === release.sourceUrl) {
    onLog?.(`Using cached CMS source ${release.releaseId}.`);
    onProgress?.(100, `CMS source ${release.releaseId} is cached`);
    return existing;
  }

  const lockHandle = await acquireSourceLock(locations.lock, onProgress);
  let staging;
  let partialArchive;
  let finalArchive;
  try {
    const afterLock = await validCachedSource(locations.active);
    if (afterLock?.metadata.sourceUrl === release.sourceUrl) {
      onProgress?.(100, `CMS source ${release.releaseId} is cached`);
      return afterLock;
    }

    staging = path.join(locations.root, `.nppes-staging-${process.pid}-${crypto.randomUUID()}`);
    partialArchive = path.join(locations.root, `.${release.archiveName}.part`);
    finalArchive = path.join(locations.root, release.archiveName);
    await adoptLegacyPartial(locations.root, release.archiveName, partialArchive);
    await rm(finalArchive, { force: true });
    await mkdir(staging, { recursive: false });

    onLog?.(`Preparing managed CMS source ${release.releaseId}.`);
    const download = await downloadArchive({ release, destination: partialArchive, fetchImpl, onProgress });
    await rename(partialArchive, finalArchive);
    const archiveHash = await hashFile(finalArchive);
    const directory = await openArchive(finalArchive);
    const dataEntries = archiveDataEntries(directory);
    const mainEntry = dataEntries.find(({ kind }) => kind === 'main');
    if (!mainEntry) throw new Error('The CMS archive does not contain the expected npidata_pfile CSV.');
    const expectedExtractedBytes = dataEntries.reduce((sum, { entry }) => sum + Number(entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0), 0);
    await assertFreeSpace(locations.root, expectedExtractedBytes + DISK_RESERVE_BYTES, 'NPPES extraction');
    const files = [];
    for (let index = 0; index < dataEntries.length; index += 1) {
      files.push(await extractEntry({
        ...dataEntries[index],
        staging,
        onProgress,
        progressStart: 84 + (index / dataEntries.length) * 14,
        progressSpan: 14 / dataEntries.length,
      }));
    }
    const mainFile = files.find(({ kind }) => kind === 'main');

    const metadata = {
      schemaVersion: 1,
      ...release,
      downloadedBytes: download.received,
      expectedBytes: download.expectedBytes || null,
      resumedBytes: download.resumedBytes,
      downloadedThisAttempt: download.downloadedThisAttempt,
      archiveSha256: archiveHash.sha256,
      mainFile: mainFile.file,
      mainFileSha256: mainFile.sha256,
      uncompressedBytes: mainFile.uncompressedBytes,
      files,
      fetchedAt: new Date().toISOString(),
      readyAt: new Date().toISOString(),
    };
    await writeFile(path.join(staging, 'source.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    await activateStagingDirectory(staging, locations.active);
    staging = null;
    if (!keepArchive) await rm(finalArchive, { force: true });
    onLog?.(`Managed CMS source ${release.releaseId} is ready.`);
    onProgress?.(100, `CMS source ${release.releaseId} is ready`);
    return validCachedSource(locations.active);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (error.discardPartial) await rm(partialArchive, { force: true }).catch(() => undefined);
    if (!keepArchive) await rm(finalArchive, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await lockHandle.close().catch(() => undefined);
    await rm(locations.lock, { force: true }).catch(() => undefined);
  }
}

export async function prepareNppesInput({
  configuredPath,
  autoDownload = true,
  ...options
} = {}) {
  const candidate = String(configuredPath ?? '').trim();
  if (candidate && candidate.toLowerCase() !== 'auto') {
    const resolved = resolveAppPath(candidate);
    try {
      const details = await stat(resolved);
      if (!details.isFile() && !details.isDirectory()) throw new Error('not a file or directory');
      options.onLog?.(`Using configured NPPES source ${relativeToApp(resolved)}.`);
      return { cached: true, inputPath: resolved, inputPathRelative: relativeToApp(resolved), managed: false };
    } catch (error) {
      if (!autoDownload) throw new Error(`Configured NPPES source is unavailable: ${candidate}. ${error.message}`);
      options.onLog?.(`Configured NPPES source ${candidate} is unavailable; preparing the managed CMS source.`, 'warn');
    }
  }
  if (!autoDownload) throw new Error('An NPPES source is required when automatic source management is disabled.');
  return { ...(await ensureNppesSource(options)), managed: true };
}
