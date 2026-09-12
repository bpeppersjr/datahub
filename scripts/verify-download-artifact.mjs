import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { symlink, link } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanupIfOwned, saveRunnerArtifact, artifactRouteAllowed } from '../desktop/download-artifact.mjs';

const APP_ROOT = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEST_TMP_ROOT = path.join(APP_ROOT, 'data', 'tmp');

async function makeLocalTemp(prefix) {
  await mkdir(TEST_TMP_ROOT, { recursive: true });
  return mkdtemp(path.join(TEST_TMP_ROOT, prefix));
}

function makeWebStream(value, options = {}) {
  const { onSecondRead, onCancel } = options;
  const text = typeof value === 'string' ? value : '';
  const encoder = new TextEncoder();
  let readCount = 0;
  let canceled = false;
  const body = new ReadableStream({
    async pull(controller) {
      readCount++;
      if (readCount === 1) {
      if (text) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      } else if (onSecondRead) {
        await onSecondRead();
        controller.error(new Error('download stream intentionally failed'));
      }
        return;
      }
      if (text && !canceled) controller.enqueue(encoder.encode(text));
      controller.close();
    },
    cancel() {
      canceled = true;
      onCancel?.();
      return Promise.resolve();
    },
  });
  return { body, isCanceled: () => canceled, canceled };
}

function makeResponse({ status = 200, headers = {}, bodyText = '', bodyConfig = {} }) {
  const headersMap = new Headers(headers);
  const stream = makeWebStream(bodyText, bodyConfig);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersMap,
    body: stream.body,
    text: async () => bodyText,
    canceled: () => stream.isCanceled(),
  };
}

test('download-artifact exports key methods', () => {
  assert.equal(typeof artifactRouteAllowed, 'function');
  assert.equal(typeof saveRunnerArtifact, 'function');
  assert.equal(typeof cleanupIfOwned, 'function');
});

test('imports block valid routes and rejects invalid routes', () => {
  assert.equal(artifactRouteAllowed('/api/runs/job_123/output'), true);
  assert.equal(artifactRouteAllowed('/api/data-operations/operations/op_1/artifacts/label.json'), true);
  assert.equal(artifactRouteAllowed('/api/status'), false);
});

test('saveRunnerArtifact saves successful JSON download', async () => {
  const runtime = await makeLocalTemp('download-artifact-success-');
  await mkdir(path.join(runtime, 'downloads'), { recursive: true });
  const response = makeResponse({
    status: 200,
    headers: { 'content-disposition': 'attachment; filename="available.json"' },
    bodyText: '{"ok":true}',
  });

  const result = await saveRunnerArtifact({
    route: '/api/runs/abc/output',
    runnerUrl: 'http://127.0.0.1:4300',
    controlToken: 'test-token',
    directory: path.join(runtime, 'downloads'),
    fetchImpl: async () => response,
  });

  const saved = JSON.parse(await readFile(result.savedPath, 'utf8'));
  assert.deepEqual(saved, { ok: true });
  assert.equal(result.savedPath, path.join(runtime, 'downloads', 'available.json'));
  await rm(runtime, { recursive: true, force: true });
});

test('saveRunnerArtifact uses collision suffix and keeps previous file', async () => {
  const runtime = await makeLocalTemp('download-artifact-collision-');
  const downloadDir = path.join(runtime, 'downloads');
  await mkdir(downloadDir, { recursive: true });
  await writeFile(path.join(downloadDir, 'available.json'), JSON.stringify({ old: true }));

  const response = makeResponse({
    status: 200,
    headers: { 'content-disposition': 'attachment; filename="available.json"' },
    bodyText: '{"ok":true}',
  });

  const result = await saveRunnerArtifact({
    route: '/api/runs/abc/output',
    runnerUrl: 'http://127.0.0.1:4300',
    controlToken: 'test-token',
    directory: downloadDir,
    fetchImpl: async () => response,
  });

  const saved = JSON.parse(await readFile(result.savedPath, 'utf8'));
  assert.deepEqual(saved, { ok: true });
  assert.equal(result.savedPath, path.join(downloadDir, 'available-1.json'));
  assert.equal(await readFile(path.join(downloadDir, 'available.json'), 'utf8'), JSON.stringify({ old: true }));
  await rm(runtime, { recursive: true, force: true });
});

test('saveRunnerArtifact rejects symbolic/junction ancestor', async (context) => {
  const runtime = await makeLocalTemp('download-artifact-link-');
  const root = path.join(runtime, 'real-root');
  const linked = path.join(runtime, 'linked');
  const downloadDir = path.join(linked, 'downloads');
  await mkdir(root, { recursive: true });
  let skipMessage = '';
  try {
    await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EEXIST') {
      skipMessage = `${error.code} when creating symlink`;
    } else if (error.code === 'EINVAL' && process.platform === 'win32') {
      skipMessage = 'junction symlink unsupported';
    } else {
      throw error;
    }
  }
  if (skipMessage) {
    context.skip(skipMessage);
    await rm(runtime, { recursive: true, force: true });
    return;
  }
  const response = makeResponse({ status: 200, bodyText: '{"ok":true}' });
  await assert.rejects(
    saveRunnerArtifact({
      route: '/api/runs/abc/output',
      runnerUrl: 'http://127.0.0.1:4300',
      controlToken: 'test-token',
      directory: downloadDir,
      fetchImpl: async () => response,
    }),
    /symbolic link or junction/i,
  );
  await rm(runtime, { recursive: true, force: true });
});

test('cleanupIfOwned does not remove replaced file', async () => {
  const runtime = await makeLocalTemp('download-artifact-cleanup-');
  const target = path.join(runtime, 'artifact.json');
  await writeFile(target, 'first');
  const first = await lstat(target);
  const replacement = path.join(runtime, 'replacement.json');
  await writeFile(replacement, 'second');
  await rm(target, { force: true });
  await rename(replacement, target);

  await cleanupIfOwned(target, { ino: first.ino, dev: first.dev });
  assert.equal((await readFile(target, 'utf8')), 'second');
  await rm(runtime, { recursive: true, force: true });
});

test('saveRunnerArtifact cancels response and returns capped-duplicates error', async () => {
  const runtime = await makeLocalTemp('download-artifact-too-many-');
  const downloadDir = path.join(runtime, 'downloads');
  await mkdir(downloadDir, { recursive: true });
  const base = path.join(downloadDir, 'available.json');
  for (let i = 0; i < 3; i++) {
    const filename = i === 0 ? base : `${path.join(downloadDir, `available-${i}.json`)}`;
    await writeFile(filename, JSON.stringify({ i }));
  }

  let streamCanceled = false;
  const stream = makeWebStream('', { onCancel: () => { streamCanceled = true; } });
  const response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-disposition': 'attachment; filename=\"available.json\"' }),
    body: stream.body,
    text: async () => '',
  };
  await assert.rejects(
    saveRunnerArtifact({
      route: '/api/runs/abc/output',
      runnerUrl: 'http://127.0.0.1:4300',
      controlToken: 'test-token',
      directory: downloadDir,
      fetchImpl: async () => response,
      maxAttempts: 3,
    }),
    /Too many copies/i,
  );
  assert.equal(streamCanceled, true);
  await rm(runtime, { recursive: true, force: true });
});

test('cleanup refuses hard-linked targets', async (context) => {
  const runtime = await makeLocalTemp('download-artifact-hardlink-');
  context.after(() => rm(runtime, { recursive: true, force: true }));
  const target = path.join(runtime, 'artifact.json');
  await writeFile(target, 'preserve');
  await link(target, path.join(runtime, 'alias.json'));
  const identity = await lstat(target);
  await cleanupIfOwned(target, identity);
  assert.equal(await readFile(target, 'utf8'), 'preserve');
});

test('HTTP errors cancel body and do not expose response secrets', async () => {
  const response = makeResponse({ status: 404, bodyText: 'secret-token local/private/path' });
  await assert.rejects(saveRunnerArtifact({ route: '/api/runs/missing/output', runnerUrl: 'http://127.0.0.1:4300', controlToken: 'test', directory: TEST_TMP_ROOT, fetchImpl: async () => response }), { message: 'Artifact request failed with HTTP 404.' });
  assert.equal(response.canceled(), true);
});

test('failed stream drains and removes owned partial file without raw errors', async (context) => {
  const runtime = await makeLocalTemp('download-artifact-partial-');
  context.after(() => rm(runtime, { recursive: true, force: true }));
  const response = makeResponse({ bodyConfig: { onSecondRead: async () => {} } });
  await assert.rejects(saveRunnerArtifact({ route: '/api/runs/abc/output', runnerUrl: 'http://127.0.0.1:4300', controlToken: 'test', directory: runtime, fetchImpl: async () => response }), { message: 'Artifact download did not finish. Please try again.' });
  await assert.rejects(lstat(path.join(runtime, 'cotive-collector-output.json')), { code: 'ENOENT' });
});
