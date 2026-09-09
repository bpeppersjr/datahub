import { randomUUID } from 'node:crypto';
import { mkdir, link, unlink, lstat, rmdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical, mnSelectionWriter, mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { iaChildcareSchemaReceiptSnapshot } from './ia-childcare-schema-probe.mjs';

const sameDirectory = (a,b) => a.isDirectory() && b.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev;
const sameFile = (a,b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev && b.nlink === 1n;
async function persist(receipt, syntheticHook) {
  // Only an unchanged receipt issued in this process can cross this boundary. Arbitrary JSON, provider rows,
  // mutated claims, and historical receipts cannot be laundered into a new assessment.
  const snapshot = iaChildcareSchemaReceiptSnapshot(receipt);
  if (syntheticHook && snapshot.execution_mode !== 'injected-test-transport') throw new Error('Fault injection requires synthetic evidence.');
  const root = path.join(APP_ROOT, syntheticHook ? 'data/tmp/ia-schema-receipt-tests' : 'data/business-sources/ia-childcare/schema-probes');
  await mnSelectionCanonical(root, { create: true, output: true });
  const runId = randomUUID(), directory = path.join(root, runId);
  await mkdir(directory);
  const owner = await lstat(directory, { bigint: true });
  const temporary = path.join(directory, 'manifest.tmp'), manifest = path.join(directory, 'manifest.json');
  const owned = new Map(); let writer, published = false;
  async function stable(name, descriptor, expectedIdentity) {
    await mnSelectionCanonical(directory);
    if (!sameDirectory(owner, await lstat(directory, { bigint: true }))) throw new Error('Directory changed.');
    const names = await readdir(directory);
    if (names.length !== 1 || names[0] !== name) throw new Error('Unexpected receipt artifact.');
    const meter = {}; await mnSelectionReadJson(path.join(directory,name),100000,undefined,meter);
    if (meter.sha256 !== descriptor.sha256 || meter.bytes !== descriptor.bytes || !sameFile(expectedIdentity,meter.identity)) throw new Error('Receipt changed.');
  }
  try {
    writer = await mnSelectionWriter(temporary, 100000, undefined, owned);
    await writer.write({ run_id: runId, ...snapshot }); const descriptor = await writer.finish();
    await stable('manifest.tmp', descriptor, owned.get(temporary));
    await syntheticHook?.('before-publication', { directory, temporary, manifest });
    await stable('manifest.tmp', descriptor, owned.get(temporary));
    // Hard-link publication is atomic and no-overwrite; the manifest is never written partially.
    await link(temporary, manifest); published = true; await unlink(temporary);
    await syntheticHook?.('after-publication', { directory, temporary, manifest });
    await stable('manifest.json', descriptor, owned.get(temporary));
    return { run_id: runId, manifest: path.relative(APP_ROOT, manifest), sha256: descriptor.sha256, status: snapshot.status };
  } catch { throw new Error('Iowa schema receipt persistence failed; inspect any published manifest.'); }
  finally {
    await writer?.close();
    if (!published) {
      // Cleanup only our unique, unpublished file and directory, never recursively. Preserve uncertain ownership.
      try {
        await mnSelectionCanonical(directory);
        if (sameDirectory(owner, await lstat(directory, { bigint: true }))) {
          const file = await lstat(temporary, { bigint: true }).catch(() => null), expected = owned.get(temporary);
          if (file && expected && sameFile(expected,file)) await unlink(temporary);
          await rmdir(directory);
        }
      } catch { /* An unexpected file or owner is evidence for inspection, not permission to delete it. */ }
    }
  }
}
export async function persistIaChildcareSchemaReceipt(receipt) { return persist(receipt); }
export async function persistIaChildcareSchemaReceiptWithTestHook(receipt, hook) {
  if (typeof hook !== 'function') throw new Error('Invalid Iowa schema receipt test hook.');
  return persist(receipt, hook);
}
