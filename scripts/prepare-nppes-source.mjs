#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { ensureNppesSource } from '../runner/nppes-source.mjs';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

try {
  const root = argumentValue('--root');
  const source = await ensureNppesSource({
    rootDirectory: root ? assertInsideApp(path.resolve(APP_ROOT, root)) : undefined,
    keepArchive: process.argv.includes('--keep-archive'),
    onProgress: (value, message) => process.stdout.write(`${String(Math.round(value)).padStart(3, ' ')}%  ${message}\n`),
    onLog: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({ input_path: source.inputPath, metadata: source.metadata }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`CMS NPPES source preparation failed: ${error.message}\n`);
  process.exitCode = 1;
}
