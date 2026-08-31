#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNationalBusinessRegistry } from "../runner/business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed partial national business registry release.

Usage:
  node scripts/build-business-registry.mjs [options]

Options:
  --output <path>  Output root (default: data/business-registry)
  --snap <path>    USDA SNAP current.json prerequisite
  --nppes <path>   CMS NPPES organizations current.json prerequisite
  --fdic <path>    FDIC BankFind current.json prerequisite
  --ncua <path>    NCUA quarterly credit-union current.json prerequisite
  --fsis <path>    USDA FSIS active MPI establishment current.json prerequisite
  --echo <path>    EPA ECHO active regulated-facility current.json prerequisite
  --fmcsa <path>   FMCSA active U.S. Company Census current.json prerequisite
  --irs-eo <path>  IRS EO BMF organization current.json prerequisite
  --ct-business <path> Connecticut active Business Registry current.json prerequisite
  --co-business <path> Colorado Good Standing or Delinquent Business Registry current.json prerequisite
  --or-business <path> Oregon active Business Registry registrations current.json prerequisite
  --ia-business <path> Iowa active Business Registry entities current.json prerequisite
  --usps-zips <path> USPS operational ZIP assignments current.json prerequisite
  --help           Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-registry",
    snap: "data/business-sources/usda-snap/current.json",
    nppes: "data/business-sources/cms-nppes-organizations/current.json",
    fdic: "data/business-sources/fdic-bankfind/current.json",
    ncua: "data/business-sources/ncua-quarterly-credit-unions/current.json",
    fsis: "data/business-sources/fsis-active-mpi-establishments/current.json",
    echo: "data/business-sources/epa-echo-active-facilities/current.json",
    fmcsa: "data/business-sources/fmcsa-active-us-company-census/current.json",
    irsEo: "data/business-sources/irs-eo-bmf-organizations/current.json",
    ctBusiness: "data/business-sources/ct-business-registry-active-organizations/current.json",
    coBusiness: "data/business-sources/co-business-registry-good-standing-or-delinquent-organizations/current.json",
    orBusiness: "data/business-sources/or-business-registry-active-registrations/current.json",
    iaBusiness: "data/business-sources/ia-business-registry-active-entities/current.json",
    uspsZips: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--snap", "--nppes", "--fdic", "--ncua", "--fsis", "--echo", "--fmcsa", "--irs-eo", "--ct-business", "--co-business", "--or-business", "--ia-business", "--usps-zips"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--snap") options.snap = value;
      if (argument === "--nppes") options.nppes = value;
      if (argument === "--fdic") options.fdic = value;
      if (argument === "--ncua") options.ncua = value;
      if (argument === "--fsis") options.fsis = value;
      if (argument === "--echo") options.echo = value;
      if (argument === "--fmcsa") options.fmcsa = value;
      if (argument === "--irs-eo") options.irsEo = value;
      if (argument === "--ct-business") options.ctBusiness = value;
      if (argument === "--co-business") options.coBusiness = value;
      if (argument === "--or-business") options.orBusiness = value;
      if (argument === "--ia-business") options.iaBusiness = value;
      if (argument === "--usps-zips") options.uspsZips = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = await buildNationalBusinessRegistry({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    snapPointer: assertInsideApp(path.resolve(APP_ROOT, options.snap)),
    nppesPointer: assertInsideApp(path.resolve(APP_ROOT, options.nppes)),
    fdicPointer: assertInsideApp(path.resolve(APP_ROOT, options.fdic)),
    ncuaPointer: assertInsideApp(path.resolve(APP_ROOT, options.ncua)),
    fsisPointer: assertInsideApp(path.resolve(APP_ROOT, options.fsis)),
    echoPointer: assertInsideApp(path.resolve(APP_ROOT, options.echo)),
    fmcsaPointer: assertInsideApp(path.resolve(APP_ROOT, options.fmcsa)),
    irsEoPointer: assertInsideApp(path.resolve(APP_ROOT, options.irsEo)),
    ctBusinessPointer: assertInsideApp(path.resolve(APP_ROOT, options.ctBusiness)),
    coBusinessPointer: assertInsideApp(path.resolve(APP_ROOT, options.coBusiness)),
    orBusinessPointer: assertInsideApp(path.resolve(APP_ROOT, options.orBusiness)),
    iaBusinessPointer: assertInsideApp(path.resolve(APP_ROOT, options.iaBusiness)),
    uspsZipsPointer: options.uspsZips ? assertInsideApp(path.resolve(APP_ROOT, options.uspsZips)) : null,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    status: result.manifest.status,
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`National business registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
