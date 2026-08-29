import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  discoverCurrentNppesRelease,
  ensureNppesSource,
  inspectNppesSource,
} from './nppes-source.mjs';
import { TEMP_DIR } from './paths.mjs';

const releaseUrl = 'https://download.cms.gov/nppes/NPPES_Data_Dissemination_August_2026_V2.zip';
const releaseHtml = `<html><a href="./NPPES_Data_Dissemination_August_2026_V2.zip" id="DDSMTH.ZIP.D">Monthly V2</a></html>`;
const archiveBody = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04]);
const providerCsv = 'NPI,Entity Type Code\n1234567890,2\n';

function sourceFetch(counter) {
  return async (url) => {
    if (String(url).endsWith('/NPI_Files.html')) {
      counter.discovery += 1;
      return new Response(releaseHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (String(url) === releaseUrl) {
      counter.download += 1;
      return new Response(archiveBody, {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Length': String(archiveBody.length) },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

function mockArchive() {
  return {
    files: [{
      path: 'NPPES_Data_Dissemination/npidata_pfile_test.csv',
      vars: { uncompressedSize: Buffer.byteLength(providerCsv) },
      stream: () => Readable.from([providerCsv]),
    }],
  };
}

test('discovers the monthly CMS NPPES V2 release from the official anchor', async () => {
  const release = await discoverCurrentNppesRelease({ fetchImpl: sourceFetch({ discovery: 0, download: 0 }) });
  assert.equal(release.sourceUrl, releaseUrl);
  assert.equal(release.releaseId, 'NPPES_Data_Dissemination_August_2026_V2');
});

test('downloads, validates, extracts, activates, and reuses a managed NPPES source', async () => {
  await mkdir(TEMP_DIR, { recursive: true });
  const rootDirectory = await mkdtemp(path.join(TEMP_DIR, 'nppes-source-test-'));
  const counter = { discovery: 0, download: 0 };
  try {
    const first = await ensureNppesSource({
      rootDirectory,
      fetchImpl: sourceFetch(counter),
      openArchive: async () => mockArchive(),
    });
    assert.equal(first.cached, true);
    assert.equal(first.metadata.releaseId, 'NPPES_Data_Dissemination_August_2026_V2');
    assert.equal(await readFile(first.inputPath, 'utf8'), providerCsv);
    assert.equal(counter.download, 1);
    assert.deepEqual((await readdir(rootDirectory)).sort(), ['nppes']);

    const second = await ensureNppesSource({
      rootDirectory,
      fetchImpl: sourceFetch(counter),
      openArchive: async () => { throw new Error('The cached source should not reopen an archive.'); },
    });
    assert.equal(second.inputPath, first.inputPath);
    assert.equal(counter.discovery, 2);
    assert.equal(counter.download, 1);

    const status = await inspectNppesSource({ rootDirectory });
    assert.equal(status.cached, true);
    assert.equal(status.releaseId, 'NPPES_Data_Dissemination_August_2026_V2');
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('uses a validated cache if CMS release discovery is temporarily unavailable', async () => {
  await mkdir(TEMP_DIR, { recursive: true });
  const rootDirectory = await mkdtemp(path.join(TEMP_DIR, 'nppes-fallback-test-'));
  try {
    const first = await ensureNppesSource({
      rootDirectory,
      fetchImpl: sourceFetch({ discovery: 0, download: 0 }),
      openArchive: async () => mockArchive(),
    });
    const messages = [];
    const cached = await ensureNppesSource({
      rootDirectory,
      fetchImpl: async () => { throw new Error('offline'); },
      onLog: (message, level) => messages.push({ message, level }),
    });
    assert.equal(cached.inputPath, first.inputPath);
    assert.equal(messages[0].level, 'warn');
    assert.match(messages[0].message, /using cached/i);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

