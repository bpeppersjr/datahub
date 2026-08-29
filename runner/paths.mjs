import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = process.env.DATAHUB_ROOT
  ? path.resolve(process.env.DATAHUB_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const OUTPUT_DIR = path.join(DATA_DIR, 'outputs');
export const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
export const TEMP_DIR = path.join(DATA_DIR, 'tmp');
export const CHECKPOINT_DIR = path.join(DATA_DIR, 'checkpoints');
export const OCR_CACHE_DIR = path.join(DATA_DIR, 'tesseract-cache');
export const DOWNLOAD_DIR = path.join(APP_ROOT, 'downloads');

export function assertInsideApp(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(APP_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Local paths must stay inside the datahub folder.');
  }
  return resolved;
}

export function resolveAppPath(candidate) {
  if (!candidate) throw new Error('A local input path is required.');
  return assertInsideApp(path.isAbsolute(candidate) ? candidate : path.join(APP_ROOT, candidate));
}

export function relativeToApp(candidate) {
  return path.relative(APP_ROOT, candidate).replaceAll('\\', '/');
}
