#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNationalBusinessRegistry } from "../runner/business-registry.mjs";
import { assertNormalizedUsPostalMigrationReady } from "../runner/normalized-us-postal-migration.mjs";
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
  --de-business <path> Delaware current Business Licenses current.json prerequisite
  --ak-business <path> Alaska DCCED active Business License current.json prerequisite
  --co-business <path> Colorado Good Standing or Delinquent Business Registry current.json prerequisite
  --wa-lni-contractors <path> Washington L&I active-contractor organizations current.json prerequisite
  --or-business <path> Oregon active Business Registry registrations current.json prerequisite
  --ia-business <path> Iowa active Business Registry entities current.json prerequisite
  --ny-business <path> New York Active Corporations current.json prerequisite
  --fl-business <path> Florida quarterly active corporate entities current.json prerequisite
  --pa-business <path> Pennsylvania Department of State active registrations current.json prerequisite
  --la-active-businesses <path> City of Los Angeles active-business location accounts current.json prerequisite
  --tx-sales-tax <path> Texas Comptroller active sales-tax permit outlets current.json prerequisite
  --chicago-licenses <path> City of Chicago current active business-license sites current.json prerequisite
  --dc-licenses <path> District of Columbia DLCP active Basic Business License sites current.json prerequisite
  --ca-abc <path> California ABC active issued-license sites current.json prerequisite
  --ny-retail-food <path> New York retail-food-store licenses current.json prerequisite
  --nyc-dcwp <path> NYC DCWP active Premises-license sites current.json prerequisite
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
    deBusiness: "data/business-sources/de-business-licenses-current/current.json",
    akBusiness: "data/business-sources/ak-active-business-licenses/current.json",
    coBusiness: "data/business-sources/co-business-registry-good-standing-or-delinquent-organizations/current.json",
    waLniActiveContractors: "data/business-sources/wa-lni-active-contractor-organizations/current.json",
    orBusiness: "data/business-sources/or-business-registry-active-registrations/current.json",
    iaBusiness: "data/business-sources/ia-business-registry-active-entities/current.json",
    nyBusiness: "data/business-sources/ny-business-registry-active-entities/current.json",
    flBusiness: "data/business-sources/fl-business-registry-quarterly-active-entities/current.json",
    paBusiness: "data/business-sources/pa-business-registry-active-registrations/current.json",
    laActiveBusinesses: "data/business-sources/la-active-business-location-accounts/current.json",
    txActiveSalesTax: "data/business-sources/tx-active-sales-tax-outlets/current.json",
    chicagoActiveBusinessLicenses: "data/business-sources/chicago-active-business-license-sites/current.json",
    dcBasicBusinessLicenses: "data/business-sources/dc-basic-business-license-sites/current.json",
    caAbcActiveLicenses: "data/business-sources/ca-abc-active-license-sites/current.json",
    nyRetailFoodStores: "data/business-sources/ny-retail-food-store-license-sites/current.json",
    nycDcwpActiveLicenses: "data/business-sources/nyc-dcwp-active-license-sites/current.json",
    uspsZips: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--snap", "--nppes", "--fdic", "--ncua", "--fsis", "--echo", "--fmcsa", "--irs-eo", "--ct-business", "--de-business", "--ak-business", "--co-business", "--wa-lni-contractors", "--or-business", "--ia-business", "--ny-business", "--fl-business", "--pa-business", "--la-active-businesses", "--tx-sales-tax", "--chicago-licenses", "--dc-licenses", "--ca-abc", "--ny-retail-food", "--nyc-dcwp", "--usps-zips"].includes(argument)) {
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
      if (argument === "--de-business") options.deBusiness = value;
      if (argument === "--ak-business") options.akBusiness = value;
      if (argument === "--co-business") options.coBusiness = value;
      if (argument === "--wa-lni-contractors") options.waLniActiveContractors = value;
      if (argument === "--or-business") options.orBusiness = value;
      if (argument === "--ia-business") options.iaBusiness = value;
      if (argument === "--ny-business") options.nyBusiness = value;
      if (argument === "--fl-business") options.flBusiness = value;
      if (argument === "--pa-business") options.paBusiness = value;
      if (argument === "--la-active-businesses") options.laActiveBusinesses = value;
      if (argument === "--tx-sales-tax") options.txActiveSalesTax = value;
      if (argument === "--chicago-licenses") options.chicagoActiveBusinessLicenses = value;
      if (argument === "--dc-licenses") options.dcBasicBusinessLicenses = value;
      if (argument === "--ca-abc") options.caAbcActiveLicenses = value;
      if (argument === "--ny-retail-food") options.nyRetailFoodStores = value;
      if (argument === "--nyc-dcwp") options.nycDcwpActiveLicenses = value;
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
  const sourcePointers = {
    snap: assertInsideApp(path.resolve(APP_ROOT, options.snap)),
    nppes: assertInsideApp(path.resolve(APP_ROOT, options.nppes)),
    fdic: assertInsideApp(path.resolve(APP_ROOT, options.fdic)),
    ncua: assertInsideApp(path.resolve(APP_ROOT, options.ncua)),
    fsis: assertInsideApp(path.resolve(APP_ROOT, options.fsis)),
    echo: assertInsideApp(path.resolve(APP_ROOT, options.echo)),
    fmcsa: assertInsideApp(path.resolve(APP_ROOT, options.fmcsa)),
    irsEo: assertInsideApp(path.resolve(APP_ROOT, options.irsEo)),
    ctBusiness: assertInsideApp(path.resolve(APP_ROOT, options.ctBusiness)),
    deBusiness: assertInsideApp(path.resolve(APP_ROOT, options.deBusiness)),
    akBusiness: assertInsideApp(path.resolve(APP_ROOT, options.akBusiness)),
    coBusiness: assertInsideApp(path.resolve(APP_ROOT, options.coBusiness)),
    waLniActiveContractors: assertInsideApp(path.resolve(APP_ROOT, options.waLniActiveContractors)),
    orBusiness: assertInsideApp(path.resolve(APP_ROOT, options.orBusiness)),
    iaBusiness: assertInsideApp(path.resolve(APP_ROOT, options.iaBusiness)),
    nyBusiness: assertInsideApp(path.resolve(APP_ROOT, options.nyBusiness)),
    flBusiness: assertInsideApp(path.resolve(APP_ROOT, options.flBusiness)),
    paBusiness: assertInsideApp(path.resolve(APP_ROOT, options.paBusiness)),
    laActiveBusinesses: assertInsideApp(path.resolve(APP_ROOT, options.laActiveBusinesses)),
    txActiveSalesTax: assertInsideApp(path.resolve(APP_ROOT, options.txActiveSalesTax)),
    chicagoActiveBusinessLicenses: assertInsideApp(path.resolve(APP_ROOT, options.chicagoActiveBusinessLicenses)),
    dcBasicBusinessLicenses: assertInsideApp(path.resolve(APP_ROOT, options.dcBasicBusinessLicenses)),
    caAbcActiveLicenses: assertInsideApp(path.resolve(APP_ROOT, options.caAbcActiveLicenses)),
    nyRetailFoodStores: assertInsideApp(path.resolve(APP_ROOT, options.nyRetailFoodStores)),
    nycDcwpActiveLicenses: assertInsideApp(path.resolve(APP_ROOT, options.nycDcwpActiveLicenses)),
  };
  await assertNormalizedUsPostalMigrationReady({ pointerOverrides: sourcePointers });
  const result = await buildNationalBusinessRegistry({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    snapPointer: sourcePointers.snap,
    nppesPointer: sourcePointers.nppes,
    fdicPointer: sourcePointers.fdic,
    ncuaPointer: sourcePointers.ncua,
    fsisPointer: sourcePointers.fsis,
    echoPointer: sourcePointers.echo,
    fmcsaPointer: sourcePointers.fmcsa,
    irsEoPointer: sourcePointers.irsEo,
    ctBusinessPointer: sourcePointers.ctBusiness,
    deBusinessPointer: sourcePointers.deBusiness,
    akBusinessPointer: sourcePointers.akBusiness,
    coBusinessPointer: sourcePointers.coBusiness,
    waLniActiveContractorsPointer: sourcePointers.waLniActiveContractors,
    orBusinessPointer: sourcePointers.orBusiness,
    iaBusinessPointer: sourcePointers.iaBusiness,
    nyBusinessPointer: sourcePointers.nyBusiness,
    flBusinessPointer: sourcePointers.flBusiness,
    paBusinessPointer: sourcePointers.paBusiness,
    laActiveBusinessesPointer: sourcePointers.laActiveBusinesses,
    txActiveSalesTaxPointer: sourcePointers.txActiveSalesTax,
    chicagoActiveBusinessLicensesPointer: sourcePointers.chicagoActiveBusinessLicenses,
    dcBasicBusinessLicensesPointer: sourcePointers.dcBasicBusinessLicenses,
    caAbcActiveLicensesPointer: sourcePointers.caAbcActiveLicenses,
    nyRetailFoodStoresPointer: sourcePointers.nyRetailFoodStores,
    nycDcwpActiveLicensesPointer: sourcePointers.nycDcwpActiveLicenses,
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
