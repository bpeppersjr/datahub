import path from 'node:path';
import {readFile, realpath, stat, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {runPdfDecoderProcess} from './pdf-decoder-process.mjs';
import {validateUtChildcarePdfLayout} from './ut-childcare-pdf-layout.mjs';

const ROOT = path.resolve(APP_ROOT);
const PYTHON = path.join(ROOT, 'data/runtimes/pdf-decoder-1/Scripts/python.exe');
const IMPLEMENTATION = ['scripts/decode-ut-childcare-pdf.py', 'scripts/pdf_process_guard.py',
  'scripts/verify-pdf-runtime.py', 'config/pdf-runtime-win-cp314.lock',
  'runner/ut-childcare-pdf-runtime.mjs', 'runner/ut-childcare-pdf-layout.mjs', 'runner/pdf-decoder-process.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nativeResults = new WeakMap();
const fail = () => { throw new Error('Utah PDF runtime prerequisite rejected.'); };
const check = value => { if (!value) fail(); };
function cancel(signal) { if (signal?.aborted) { const error = new Error('Utah PDF runtime cancelled.'); error.name = 'AbortError'; throw error; } }
async function localDirectory(directory) {
  const relative = path.relative(ROOT, directory);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  let current = ROOT;
  check(await realpath(current) === current);
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    check(await realpath(current) === current && (await stat(current)).isDirectory());
  }
}
async function localFile(file, maximum, base = ROOT) {
  const absolute = path.resolve(ROOT, file);
  const relative = path.relative(base, absolute);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  check(await realpath(absolute) === absolute);
  const info = await stat(absolute);
  check(info.isFile() && info.size > 0 && info.size <= maximum);
  const bytes = await readFile(absolute);
  check(bytes.length === info.size && bytes.length <= maximum);
  return {absolute, bytes, sha256: hash(bytes)};
}
async function implementations() {
  return Object.fromEntries(await Promise.all(IMPLEMENTATION.map(async file => [file, (await localFile(file, 256_000)).sha256])));
}
function environment() {
  const value = {TEMP: path.join(ROOT, 'data/tmp'), TMP: path.join(ROOT, 'data/tmp')};
  for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) value[name] = process.env[name];
  return value;
}
async function probe(env, signal) {
  const result = await runPdfDecoderProcess({executable: PYTHON,
    args: ['-B', '-E', '-s', path.join(ROOT, 'scripts/verify-pdf-runtime.py'), '--managed'], cwd: ROOT, env, signal,
    timeoutMs: 15_000, maxStdoutBytes: 16_000});
  check(result.evidence.stderrBytes === 0);
  const value = JSON.parse(result.stdout.toString('utf8'));
  check(value.schema_version === 'cotive-pdf-runtime-probe@1.0.0' && value.python_version === '3.14.7'
    && value.platform === 'win32' && value.architecture === 'AMD64'
    && /^[a-f0-9]{64}$/.test(value.package_record_inventory_sha256)
    && /^[a-f0-9]{64}$/.test(value.venv_launcher_sha256) && value.package_files > 0
    && value.full_base_runtime_attested === false);
  return value;
}

// Local processing only. No network, acquisition enrollment, scheduler, or publication.
export async function runUtChildcarePdfPrerequisite(options) {
  try {
    check(options && Object.keys(options).every(key => ['sourcePath', 'sourceSha256', 'reportEdition', 'signal'].includes(key)));
    const {sourcePath, sourceSha256, reportEdition, signal} = options;
    check(typeof sourcePath === 'string' && /^[a-f0-9]{64}$/.test(sourceSha256)
      && /^(January|February|March|April|May|June|July|August|September|October|November|December) 20\d{2}$/.test(reportEdition)
      && (signal === undefined || signal instanceof AbortSignal));
    cancel(signal);
    check(process.platform === 'win32');
    const source = await localFile(sourcePath, 500_000, path.join(ROOT, 'data'));
    check(source.sha256 === sourceSha256);
    await localFile(PYTHON, 50_000_000);
    const pins = await implementations(), env = environment();
    await localDirectory(env.TEMP);
    const runtime = await probe(env, signal);
    const startedAt = new Date().toISOString();
    const execution = await runPdfDecoderProcess({executable: PYTHON,
      args: ['-B', '-E', '-s', path.join(ROOT, 'scripts/decode-ut-childcare-pdf.py'), '--managed',
        source.absolute, sourceSha256, reportEdition], cwd: ROOT, env, signal, maxStdoutBytes: 64_000_000});
    check(execution.evidence.stderrBytes === 0);
    const decoded = JSON.parse(execution.stdout.toString('utf8'));
    check(decoded.guard?.backend === 'windows-job-process-commit'
      && decoded.guard.memory_bytes === 1_073_741_824 && decoded.guard.timeout_seconds === 60);
    const selected = validateUtChildcarePdfLayout(decoded.document, {signal});
    check(JSON.stringify(await probe(env, signal)) === JSON.stringify(runtime));
    check(JSON.stringify(await implementations()) === JSON.stringify(pins));
    check((await localFile(sourcePath, 500_000, path.join(ROOT, 'data'))).sha256 === sourceSha256);
    cancel(signal);
    const result = {selected, receipt: {schema_version: 'ut-childcare-pdf-prerequisite@1.0.0',
      status: 'validated-local-source', started_at: startedAt, finished_at: new Date().toISOString(),
      source: {path: path.relative(ROOT, source.absolute).replaceAll('\\', '/'), sha256: sourceSha256,
        bytes: source.bytes.length, report_edition: reportEdition},
      runtime, implementation_sha256: pins, resource_guard: decoded.guard,
      process: execution.evidence, selected_sha256: hash(JSON.stringify(selected)),
      total_rows: selected.total_rows, selected_rows: selected.selected_rows,
      claims: {app_acquisition_verified: false, source_authenticity_independently_verified: false,
        public_export_authorized: false, current_operations_verified: false,
        national_coverage_integrated: false, runtime_independently_security_audited: false}}};
    nativeResults.set(result, {sha256: hash(JSON.stringify(result)), signal});
    return result;
  } catch (error) {
    if (error?.name === 'AbortError' || options?.signal?.aborted) cancel(options.signal);
    fail();
  }
}

// Publish only a local internal prerequisite receipt; never a business release.
export async function retainUtChildcarePdfPrerequisite(result) {
  const execution = nativeResults.get(result);
  check(execution && execution.sha256 === hash(JSON.stringify(result)));
  cancel(execution.signal);
  check(result?.receipt?.schema_version === 'ut-childcare-pdf-prerequisite@1.0.0'
    && result.receipt.selected_sha256 === hash(JSON.stringify(result.selected)));
  const parent = path.join(ROOT, 'data/business-sources/ut-childcare/pdf-prerequisites');
  await localDirectory(parent);
  const directory = path.join(parent, randomUUID());
  nativeResults.delete(result);
  await mkdir(directory);
  try {
  const artifact = Buffer.from(JSON.stringify(result.selected));
  await writeFile(path.join(directory, 'selected-observations.json'), artifact, {flag: 'wx'});
  const receipt = {...result.receipt, export_policy: 'internal-prerequisite-only',
    artifact: {path: 'selected-observations.json', bytes: artifact.length, sha256: hash(artifact)}};
  await writeFile(path.join(directory, 'receipt.pending.json'), JSON.stringify(receipt, null, 2), {flag: 'wx'});
  cancel(execution.signal);
  await rename(path.join(directory, 'receipt.pending.json'), path.join(directory, 'receipt.json'));
  return {path: path.join(directory, 'receipt.json'), sha256: hash(await readFile(path.join(directory, 'receipt.json')))};
  } catch (error) {
    // Remove only this invocation's unpublished UUID directory, never a release.
    const published = await stat(path.join(directory, 'receipt.json')).then(() => true, () => false);
    if (!published && await realpath(directory) === directory) await rm(directory, {recursive: true, force: true});
    throw error;
  }
}
