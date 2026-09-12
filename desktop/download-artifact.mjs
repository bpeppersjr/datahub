import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { createWriteStream, fstat } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const MAX_DOWNLOAD_ATTEMPTS = 10_000;
const fstatAsync = promisify(fstat);

function sanitizeFilename(value) {
  const safe = String(value ?? 'cotive-collector-output.json').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || /^\.+$/.test(safe) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe)) {
    return 'cotive-collector-output.json';
  }
  return safe.slice(0, 200);
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}

async function parseResponseError(response) {
  return `Artifact request failed with HTTP ${response.status}.`;
}

function isDisallowedTarget(stats) {
  return Boolean(stats?.isSymbolicLink?.());
}

function resolveDirectoryAncestors(absoluteDirectory) {
  const ancestors = [];
  for (let cursor = path.resolve(absoluteDirectory); ; ) {
    ancestors.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return ancestors.reverse();
}

async function ensureDownloadDirectory(directory) {
  const absoluteDirectory = path.resolve(directory);
  if (!path.isAbsolute(absoluteDirectory)) throw new Error('Download directory must be absolute.');

  for (const ancestor of resolveDirectoryAncestors(absoluteDirectory)) {
    const stats = await lstat(ancestor).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stats && isDisallowedTarget(stats)) {
      throw new Error('Download path contains symbolic link or junction component.');
    }
  }

  await mkdir(absoluteDirectory, { recursive: true });
  const canonicalDirectory = path.resolve(await realpath(absoluteDirectory));
  if (!samePath(canonicalDirectory, absoluteDirectory)) {
    throw new Error('Download directory resolved outside expected local path.');
  }
  return canonicalDirectory;
}

export async function cleanupIfOwned(filePath, targetIdentity) {
  if (!targetIdentity) return;
  try {
    const latest = await lstat(filePath);
    if (!latest.isFile() || latest.nlink !== 1) return;
    if (latest.ino !== targetIdentity.ino || latest.dev !== targetIdentity.dev) return;
    await rm(filePath, { force: true });
  } catch {}
}

export async function saveRunnerArtifact({ route, runnerUrl, controlToken, directory, fetchImpl = fetch, maxAttempts = MAX_DOWNLOAD_ATTEMPTS }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_DOWNLOAD_ATTEMPTS) throw new Error('Invalid artifact copy limit.');
  if (!artifactRouteAllowed(route)) throw new Error('Unsupported artifact download route.');

  let response;
  try {
    response = await fetchImpl(`${runnerUrl}${route}`, {
      headers: { Authorization: `Bearer ${controlToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(300000),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Artifact request failed before receiving a response.');
    }
    throw new Error('Artifact request failed due to network interruption.');
  }

  if (!response.ok) {
    const message = await parseResponseError(response);
    await response.body?.cancel().catch(() => {});
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Artifact response had no content.');
  }

  let canonicalDirectory;
  try {
    canonicalDirectory = await ensureDownloadDirectory(directory);
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }

  const declared = response.headers.get('content-disposition')?.match(/filename=\"([^\"]+)\"/i)?.[1];
  const filename = sanitizeFilename(declared ?? 'cotive-collector-output.json');
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length);
  const directoryIdentity = await lstat(canonicalDirectory);
  async function verifyDirectoryIdentity() {
    const current = await lstat(canonicalDirectory);
    if (!current.isDirectory() || current.isSymbolicLink()
      || current.ino !== directoryIdentity.ino || current.dev !== directoryIdentity.dev
      || !samePath(await realpath(canonicalDirectory), canonicalDirectory)) {
      throw new Error('Download directory changed during the artifact request.');
    }
  }

  try {
    for (let suffix = 0; suffix < maxAttempts; suffix++) {
      const savedPath = path.join(canonicalDirectory, suffix ? `${stem}-${suffix}${extension}` : filename);
      if (!samePath(path.dirname(savedPath), canonicalDirectory)) {
        throw new Error('Artifact file path escaped the download directory.');
      }

      const existing = await lstat(savedPath).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
      if (existing) {
        if (isDisallowedTarget(existing)) {
          throw new Error('Download target path resolves to a symbolic link.');
        }
        if (existing.isFile()) {
          continue;
        }
        throw new Error('Download target path is not a regular file.');
      }

      let targetStream = null;
      let targetIdentity = null;
      try {
        await verifyDirectoryIdentity();
        targetStream = createWriteStream(savedPath, { flags: 'wx' });
        await once(targetStream, 'open');
        const opened = await fstatAsync(targetStream.fd);
        if (!opened.isFile() || opened.nlink !== 1) throw new Error('Artifact target is not a single-link file.');
        targetIdentity = { ino: opened.ino, dev: opened.dev };

        await pipeline(Readable.fromWeb(response.body), targetStream);
        await verifyDirectoryIdentity();
        const saved = await lstat(savedPath);
        if (!saved.isFile() || saved.nlink !== 1 || saved.ino !== targetIdentity.ino || saved.dev !== targetIdentity.dev) {
          throw new Error('Artifact target changed during the download.');
        }
        return { savedPath };
      } catch (error) {
        if (targetStream) {
          if (!targetStream.closed) {
            const drained = new Promise((resolve) => targetStream.once('close', resolve));
            targetStream.destroy();
            await drained;
          }
          await verifyDirectoryIdentity().then(() => cleanupIfOwned(savedPath, targetIdentity)).catch(() => {});
        }
        if (error?.code === 'EEXIST') continue;
        await response.body?.cancel().catch(() => {});
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
          throw new Error('Artifact download was cancelled.');
        }
        throw new Error('Artifact download did not finish. Please try again.');
      }
    }
    await response.body?.cancel().catch(() => {});
    throw new Error('Too many copies of this artifact in the downloads folder.');
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}

export function artifactRouteAllowed(route) {
  return typeof route === 'string' && (
    /^\/api\/runs\/[a-zA-Z0-9_-]+\/output$/.test(route) ||
    /^\/api\/data-operations\/operations\/[a-zA-Z0-9_-]+\/artifacts\/[a-zA-Z0-9._%-]+$/.test(route) ||
    route === '/api/entity-resolution/benchmark/labels'
  ) && !/%(?:2f|5c|00)/i.test(route);
}
