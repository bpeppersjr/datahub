import { randomUUID } from 'node:crypto';
import { mkdir, link, unlink, lstat, rmdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical, mnSelectionWriter, mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { okChildcareSchemaReceiptSnapshot } from './ok-childcare-schema-probe.mjs';

const sameDirectory = (a, b) => a.isDirectory() && b.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev;
const sameFile = (a, b) => a && b && a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev && b.nlink === 1n;
async function persist(receipt, signal, hook) {
  const snapshot = okChildcareSchemaReceiptSnapshot(receipt);
  if (hook && snapshot.execution_mode !== 'injected-test-transport') throw Error('Synthetic evidence required.');
  signal?.throwIfAborted();
  const root = path.join(APP_ROOT, snapshot.execution_mode === 'injected-test-transport'
    ? 'data/tmp/ok-schema-receipt-tests' : 'data/business-sources/ok-childcare/schema-probes');
  await mnSelectionCanonical(root, { create: true, output: true, signal });
  const runId = randomUUID(), directory = path.join(root, runId);
  await mkdir(directory);
  const owner = await lstat(directory, { bigint: true });
  const temporary = path.join(directory, 'manifest.tmp'), manifest = path.join(directory, 'manifest.json');
  const owned = new Map(); let writer, published = false, descriptor;
  async function stable(name) {
    await mnSelectionCanonical(directory);
    if (!sameDirectory(owner, await lstat(directory, { bigint: true }))) throw Error('Directory changed.');
    const names = await readdir(directory);
    if (names.length !== 1 || names[0] !== name) throw Error('Unexpected artifact.');
    const meter = {}; await mnSelectionReadJson(path.join(directory, name), 100000, undefined, meter);
    if (meter.sha256 !== descriptor.sha256 || meter.bytes !== descriptor.bytes || !sameFile(owned.get(temporary), meter.identity)) throw Error('Receipt changed.');
  }
  try {
    writer = await mnSelectionWriter(temporary, 100000, signal, owned);
    await writer.write({ run_id: runId, ...snapshot }); descriptor = await writer.finish();
    await stable('manifest.tmp'); await hook?.('before-publication', { directory, temporary, manifest });
    await stable('manifest.tmp'); signal?.throwIfAborted();
    await link(temporary, manifest); published = true; await unlink(temporary);
    // Once published, finish local verification even if cancellation arrives.
    await hook?.('after-publication', { directory, temporary, manifest }); await stable('manifest.json');
    return { run_id: runId, manifest: path.relative(APP_ROOT, manifest).replaceAll('\\', '/'), sha256: descriptor.sha256,
      status: snapshot.status, cancellation_after_publication: Boolean(signal?.aborted) };
  } catch {
    const error = new Error(published ? 'Oklahoma schema receipt may be published; inspect before retry.' : 'Oklahoma schema receipt publication failed.');
    error.code = published ? 'OK_SCHEMA_PUBLICATION_UNCERTAIN' : 'OK_SCHEMA_PUBLICATION_FAILED';
    if (published) error.recovery = { run_id: runId, manifest: path.relative(APP_ROOT, manifest).replaceAll('\\', '/'), expected_sha256: descriptor.sha256 };
    throw error;
  } finally {
    await writer?.close();
    if (!published) try {
      await mnSelectionCanonical(directory);
      if (sameDirectory(owner, await lstat(directory, { bigint: true }))) {
        const file = await lstat(temporary, { bigint: true }).catch(() => null);
        if (sameFile(owned.get(temporary), file)) await unlink(temporary);
        await rmdir(directory);
      }
    } catch { /* Preserve unexpected ownership or artifacts for inspection. */ }
  }
}
export async function persistOkChildcareSchemaReceipt(receipt, { signal } = {}) { return persist(receipt, signal); }
export async function persistOkChildcareSchemaReceiptWithTestHook(receipt, hook, { signal } = {}) {
  if (typeof hook !== 'function') throw Error('Invalid Oklahoma schema test hook.');
  return persist(receipt, signal, hook);
}
