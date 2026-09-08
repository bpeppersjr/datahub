import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {runUtChildcarePdfPrerequisite, retainUtChildcarePdfPrerequisite} from '../runner/ut-childcare-pdf-runtime.mjs';

const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
process.on('message', message => { if (message?.type === 'cancel') stop(); });
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/process-ut-childcare-pdf.mjs --source PATH --sha256 SHA256 --edition "September 2026"');
  } else {
    if (args.length !== 6) throw Error('arguments');
    const options = {};
    const keys = {'--source': 'sourcePath', '--sha256': 'sourceSha256', '--edition': 'reportEdition'};
    for (let index = 0; index < args.length; index += 2) {
      const key = keys[args[index]];
      if (!key || Object.hasOwn(options, key)) throw Error('arguments');
      options[key] = args[index + 1];
    }
    const result = await runUtChildcarePdfPrerequisite({...options, signal: controller.signal});
    const saved = await retainUtChildcarePdfPrerequisite(result);
    console.log(JSON.stringify({status: 'validated-local-source',
      receipt: path.relative(APP_ROOT, saved.path).replaceAll('\\', '/'), sha256: saved.sha256,
      total_rows: result.selected.total_rows, selected_rows: result.selected.selected_rows,
      acquisition_performed: false, public_export_authorized: false}));
  }
} catch {
  console.error(controller.signal.aborted ? 'Utah PDF processing cancelled.' : 'Utah PDF prerequisite failed; check runtime setup and retained-source inputs.');
  process.exitCode = 1;
} finally {
  if (process.connected) process.disconnect();
}
