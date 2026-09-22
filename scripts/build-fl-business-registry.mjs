#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { buildFlBusinessRegistry, loadFlBusinessRegistrySourceRelease, publishFlBusinessRegistryStaging } from "../runner/fl-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

function usage() {
  return `Build the governed Florida quarterly active corporate-entity release.

Usage:
  node scripts/build-fl-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/fl-business-registry-quarterly-active-entities)
  --zbp <path>          Census ZBP current.json prerequisite
  --archive <path>      Use an already downloaded official cordata.zip inside datahub
  --source-release <path>
                        Replay a verified published Florida current.json or manifest.json
  --minimum <number>    Minimum organizations quality floor (default: 2000000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run
  --resume-source-staging-run <UUID>
                        Replay one privacy-minimized selected-field staged snapshot into a new run
  --help                Show this help

Live SFTP acquisition requires FL_SUNBIZ_PUBLIC_PASSWORD in the process environment.
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/fl-business-registry-quarterly-active-entities",
    zbp: "data/business-baselines/census-zbp/current.json",
    archive: null,
    minimum: 2_000_000,
    resumeStagingRun: null,
    resumeSourceStagingRun: null,
    sourceRelease: null,
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--archive", "--source-release", "--minimum", "--resume-staging-run", "--resume-source-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once.`);
      seen.add(argument);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--archive") options.archive = value;
      if (argument === "--source-release") options.sourceRelease = value;
      if (argument === "--minimum") options.minimum = Number(value);
      if (argument === "--resume-staging-run") options.resumeStagingRun = value;
      if (argument === "--resume-source-staging-run") options.resumeSourceStagingRun = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  if ([options.archive, options.sourceRelease, options.resumeStagingRun, options.resumeSourceStagingRun].filter(Boolean).length > 1) throw new Error("Archive, source-release, and resume modes are mutually exclusive.");
  return options;
}

const cancellation = createCliCancellation();
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (options.resumeStagingRun && !uuid.test(options.resumeStagingRun)) throw new Error("--resume-staging-run requires a UUID.");
  if (options.resumeSourceStagingRun && !uuid.test(options.resumeSourceStagingRun)) throw new Error("--resume-source-staging-run requires a UUID.");
  let sourceSnapshotPath = null;
  let sourceMetadata = null;
  if (options.sourceRelease) {
    const replay = await loadFlBusinessRegistrySourceRelease({
      releasePath: assertInsideApp(path.resolve(APP_ROOT, options.sourceRelease)),
      allowedRoot: APP_ROOT,
      signal: cancellation.signal,
    });
    sourceSnapshotPath = replay.sourceSnapshotPath;
    sourceMetadata = replay.sourceMetadata;
    process.stdout.write(`Verified reusable Florida selected-source release ${replay.sourceReleaseId}.\n`);
  } else if (options.resumeSourceStagingRun) {
    const staging = assertInsideApp(path.join(outputRoot, ".staging", options.resumeSourceStagingRun));
    sourceSnapshotPath = assertInsideApp(path.join(staging, "source", "selected-corporate-records.jsonl.gz"));
    const preflight = JSON.parse(await readFile(assertInsideApp(path.join(staging, "source", "preflight.json")), { encoding: "utf8", signal: cancellation.signal }));
    sourceMetadata = {
      remotePath: preflight.remote_path,
      bytes: preflight.remote_bytes,
      modifiedAt: preflight.remote_modified_at,
      archiveSha256: preflight.archive_sha256,
      members: preflight.archive_members,
    };
  }
  const result = options.resumeStagingRun
    ? await publishFlBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun, signal: cancellation.signal })
    : await buildFlBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      sourceArchivePath: options.archive ? assertInsideApp(path.resolve(APP_ROOT, options.archive)) : null,
      sourceSnapshotPath,
      sourceMetadata,
      minimumOrganizations: options.minimum,
      signal: cancellation.signal,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(cancellation.signal.aborted ? "Florida Business Registry build cancelled; inspect retained run evidence before resuming.\n" : `Florida Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
