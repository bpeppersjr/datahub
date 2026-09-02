import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { parse } from 'csv-parse';
import { relativeToApp, resolveAppPath } from './paths.mjs';

const RETAIL_TAXONOMY = '3336C0003X';
const MAIL_ORDER_TAXONOMY = '3336M0002X';

const aliases = {
  npi: ['NPI', 'NPI Number', 'NPI Nbr'],
  entityType: ['Entity Type Code'],
  legalName: ['Provider Organization Name (Legal Business Name)', 'Legal Business Name'],
  otherName: ['Provider Other Organization Name', 'Doing Business As Name', 'DBA Name'],
  address1: ['Provider First Line Business Practice Location Address', 'Physical Address Line 1', 'Address Line 1'],
  address2: ['Provider Second Line Business Practice Location Address', 'Physical Address Line 2', 'Address Line 2'],
  city: ['Provider Business Practice Location Address City Name', 'Physical Address City', 'City'],
  state: ['Provider Business Practice Location Address State Name', 'Physical Address State', 'State'],
  postalCode: ['Provider Business Practice Location Address Postal Code', 'Physical Address Postal Code', 'Postal Code', 'ZIP Code'],
  nabpNbr: ['NABP Nbr', 'NABP Number', 'NCPDP Number', 'NCPDP Provider ID', 'NCPDP Provider Id'],
  driveThroughFlag: ['Drive Through Flag', 'Drive-Through Flag', 'Drive Thru Flag', 'Drive Through'],
  mailOrderFlag: ['Mail Order Flag', 'Mail-Order Flag', 'Mail Order'],
  networkAffiliation: ['Network Affiliation', 'Network', 'Contracting Group', 'Purchasing Group'],
  parentCompany: ['Parent Company', 'Parent Organization', 'Parent Organization Name'],
};

const normalizeHeader = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (value) => String(value ?? '').replace(/\D/g, '');

function findHeader(headers, names, override) {
  if (override && headers.includes(override)) return override;
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const name of names) {
    const match = normalized.get(normalizeHeader(name));
    if (match) return match;
  }
  return null;
}

function formatPostalCode(value) {
  const valueDigits = digits(value);
  if (valueDigits.length < 5) return null;
  const zipCode = valueDigits.slice(0, 5);
  const zip4 = valueDigits.length >= 9 ? valueDigits.slice(5, 9) : null;
  return { zipCode, postalCode: zipCode, zip4, plus4Complete: Boolean(zip4) };
}

function booleanValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  let string = String(value);
  if (/^[=+\-@]/.test(string)) string = `'${string}`;
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function csvLine(values) {
  return `${values.map(csvValue).join(',')}\n`;
}

async function writeChunk(stream, value) {
  if (!stream.write(value)) await once(stream, 'drain');
}

async function closeStream(stream) {
  stream.end();
  await once(stream, 'finish');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
}

async function resolveCsvInput(input) {
  const absolute = resolveAppPath(input);
  const inputStat = await stat(absolute);
  if (inputStat.isFile()) return absolute;
  const entries = await readdir(absolute, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^npidata_pfile.*\.csv$/i.test(entry.name))
    .map((entry) => path.join(absolute, entry.name))
    .sort();
  if (!candidates.length) throw new Error('No npidata_pfile CSV was found in the NPPES input directory.');
  return candidates.at(-1);
}

async function readColumnMap(filename) {
  if (!filename) return {};
  const value = JSON.parse(await readFile(resolveAppPath(filename), 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('columnMapFile must contain a JSON object.');
  return value;
}

async function readEnrichment(filename, columnMap, onLog) {
  const records = new Map();
  if (!filename) return records;
  const absolute = await resolveCsvInput(filename);
  let columns;
  let rowCount = 0;
  const parser = createReadStream(absolute).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const row of parser) {
    if (!columns) {
      const headers = Object.keys(row);
      columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findHeader(headers, names, columnMap[key])]));
      if (!columns.npi) throw new Error('The enrichment CSV needs an NPI column or an npi entry in columnMapFile.');
    }
    const npi = digits(row[columns.npi]);
    if (npi.length !== 10) continue;
    records.set(npi, {
      nabpNbr: columns.nabpNbr ? String(row[columns.nabpNbr] ?? '').trim() : '',
      driveThroughFlag: columns.driveThroughFlag ? booleanValue(row[columns.driveThroughFlag]) : null,
      mailOrderFlag: columns.mailOrderFlag ? booleanValue(row[columns.mailOrderFlag]) : null,
      networkAffiliation: columns.networkAffiliation ? String(row[columns.networkAffiliation] ?? '').trim() : '',
      parentCompany: columns.parentCompany ? String(row[columns.parentCompany] ?? '').trim() : '',
    });
    rowCount += 1;
  }
  onLog(`Loaded ${rowCount.toLocaleString('en-US')} NPI-keyed enrichment records.`);
  return records;
}

function taxonomyColumns(headers) {
  return headers.filter((header) => normalizeHeader(header).startsWith('healthcareprovidertaxonomycode'));
}

function buildAddress(row) {
  return [row.address1, row.address2, `${row.city}, ${row.state} ${row.zipCode}`]
    .filter(Boolean)
    .join(', ');
}

export async function buildRetailPharmacyDirectory({
  config,
  onProgress = () => {},
  onLog = () => {},
}) {
  const zipStart = String(config.zipStart ?? '00100').padStart(5, '0');
  const zipEnd = String(config.zipEnd ?? '99999').padStart(5, '0');
  if (!/^\d{5}$/.test(zipStart) || !/^\d{5}$/.test(zipEnd) || Number(zipStart) > Number(zipEnd)) {
    throw new Error('zipStart and zipEnd must be five-digit values in ascending order.');
  }
  const nppesFile = await resolveCsvInput(config.nppesFile);
  const outputDirectory = resolveAppPath(config.outputDirectory || 'data/pharmacies');
  const columnMap = await readColumnMap(config.columnMapFile);
  const enrichment = await readEnrichment(config.enrichmentFile, columnMap, onLog);
  const fileStat = await stat(nppesFile);
  const inputStream = createReadStream(nppesFile);
  const parser = inputStream.pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  const rowsByZip = new Map();
  let columns;
  let scanned = 0;
  let retailRecords = 0;
  let missingPlus4 = 0;
  let enrichedRecords = 0;

  onLog(`Scanning ${relativeToApp(nppesFile)} for community/retail pharmacy taxonomy ${RETAIL_TAXONOMY}.`);
  onProgress(3, 'Opening the NPPES provider file');

  for await (const record of parser) {
    if (!columns) {
      const headers = Object.keys(record);
      columns = {
        npi: findHeader(headers, aliases.npi, columnMap.npi),
        entityType: findHeader(headers, aliases.entityType, columnMap.entityType),
        legalName: findHeader(headers, aliases.legalName, columnMap.legalName),
        otherName: findHeader(headers, aliases.otherName, columnMap.otherName),
        address1: findHeader(headers, aliases.address1, columnMap.address1),
        address2: findHeader(headers, aliases.address2, columnMap.address2),
        city: findHeader(headers, aliases.city, columnMap.city),
        state: findHeader(headers, aliases.state, columnMap.state),
        postalCode: findHeader(headers, aliases.postalCode, columnMap.postalCode),
        taxonomies: taxonomyColumns(headers),
      };
      const missing = ['npi', 'legalName', 'address1', 'city', 'state', 'postalCode'].filter((key) => !columns[key]);
      if (missing.length || !columns.taxonomies.length) {
        throw new Error(`NPPES columns could not be mapped: ${[...missing, ...(!columns.taxonomies.length ? ['taxonomies'] : [])].join(', ')}.`);
      }
    }
    scanned += 1;
    if (columns.entityType && String(record[columns.entityType] ?? '').trim() !== '2') continue;
    const taxonomyCodes = columns.taxonomies.map((column) => String(record[column] ?? '').trim()).filter(Boolean);
    if (!taxonomyCodes.includes(RETAIL_TAXONOMY)) continue;
    const postal = formatPostalCode(record[columns.postalCode]);
    const address1 = String(record[columns.address1] ?? '').trim();
    if (!postal || !address1 || postal.zipCode < zipStart || postal.zipCode > zipEnd) continue;
    const npi = digits(record[columns.npi]);
    if (npi.length !== 10) continue;
    const extra = enrichment.get(npi);
    if (extra) enrichedRecords += 1;
    if (!postal.plus4Complete) missingPlus4 += 1;
    const legalBusinessName = String(record[columns.legalName] ?? '').trim();
    const otherName = columns.otherName ? String(record[columns.otherName] ?? '').trim() : '';
    const row = {
      zipCode: postal.zipCode,
      name: otherName || legalBusinessName,
      physicalAddress: '',
      address1,
      address2: columns.address2 ? String(record[columns.address2] ?? '').trim() : '',
      city: String(record[columns.city] ?? '').trim(),
      state: String(record[columns.state] ?? '').trim(),
      postalCode: postal.postalCode,
      zip4: postal.zip4,
      plus4Complete: postal.plus4Complete,
      driveThroughFlag: extra?.driveThroughFlag ?? null,
      mailOrderFlag: extra?.mailOrderFlag ?? taxonomyCodes.includes(MAIL_ORDER_TAXONOMY),
      nabpNbr: extra?.nabpNbr || '',
      npiNbr: npi,
      networkAffiliation: extra?.networkAffiliation || '',
      parentCompany: extra?.parentCompany || '',
      legalBusinessName,
      taxonomyCodes,
    };
    row.physicalAddress = buildAddress(row);
    const existing = rowsByZip.get(postal.zipCode) ?? [];
    existing.push(row);
    rowsByZip.set(postal.zipCode, existing);
    retailRecords += 1;
    if (scanned % 25_000 === 0) {
      onProgress(5 + Math.min(52, (inputStream.bytesRead / Math.max(1, fileStat.size)) * 52), `Scanned ${scanned.toLocaleString('en-US')} NPPES records`);
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  const suffix = timestamp();
  const csvFile = path.join(outputDirectory, `retail-pharmacies-${suffix}.csv`);
  const jsonlFile = path.join(outputDirectory, `retail-pharmacies-${suffix}.jsonl`);
  const coverageFile = path.join(outputDirectory, `zip-coverage-${suffix}.csv`);
  const manifestFile = path.join(outputDirectory, `retail-pharmacies-${suffix}.manifest.json`);
  const temporaryCsv = `${csvFile}.tmp`;
  const temporaryJsonl = `${jsonlFile}.tmp`;
  const temporaryCoverage = `${coverageFile}.tmp`;
  const csvStream = createWriteStream(temporaryCsv, { encoding: 'utf8' });
  const jsonlStream = createWriteStream(temporaryJsonl, { encoding: 'utf8' });
  const coverageStream = createWriteStream(temporaryCoverage, { encoding: 'utf8' });
  const headers = [
    'zip_code', 'name', 'physical_address', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code', 'zip4',
    'plus4_complete', 'drive_through_flag', 'mail_order_flag', 'nabp_nbr', 'npi_nbr', 'network_affiliation',
    'parent_company', 'legal_business_name', 'taxonomy_codes',
  ];
  await writeChunk(csvStream, csvLine(headers));
  await writeChunk(coverageStream, csvLine(['zip_code', 'retail_pharmacy_count']));

  const rangeSize = Number(zipEnd) - Number(zipStart) + 1;
  let zipIndex = 0;
  for (let zipNumber = Number(zipStart); zipNumber <= Number(zipEnd); zipNumber += 1) {
    const zipCode = String(zipNumber).padStart(5, '0');
    const rows = (rowsByZip.get(zipCode) ?? []).sort((left, right) => left.name.localeCompare(right.name) || left.address1.localeCompare(right.address1));
    await writeChunk(coverageStream, csvLine([zipCode, rows.length]));
    for (const row of rows) {
      await writeChunk(csvStream, csvLine([
        row.zipCode, row.name, row.physicalAddress, row.address1, row.address2, row.city, row.state, row.postalCode, row.zip4,
        row.plus4Complete, row.driveThroughFlag, row.mailOrderFlag, row.nabpNbr, row.npiNbr, row.networkAffiliation,
        row.parentCompany, row.legalBusinessName, row.taxonomyCodes.join('|'),
      ]));
      await writeChunk(jsonlStream, `${JSON.stringify(row)}\n`);
    }
    zipIndex += 1;
    if (zipIndex % 1000 === 0) onProgress(60 + (zipIndex / rangeSize) * 34, `Indexed ZIP ${zipCode}`);
  }

  await Promise.all([closeStream(csvStream), closeStream(jsonlStream), closeStream(coverageStream)]);
  await Promise.all([
    rename(temporaryCsv, csvFile),
    rename(temporaryJsonl, jsonlFile),
    rename(temporaryCoverage, coverageFile),
  ]);
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'CMS NPPES Data Dissemination V2',
    sourceFile: relativeToApp(nppesFile),
    enrichmentFile: config.enrichmentFile ? relativeToApp(resolveAppPath(config.enrichmentFile)) : null,
    zipStart,
    zipEnd,
    scannedRecords: scanned,
    retailPharmacies: retailRecords,
    enrichedRecords,
    missingPlus4,
    fieldsRequiringEnrichment: ['drive_through_flag', 'nabp_nbr', 'network_affiliation', 'parent_company'],
    nabpNumberNote: 'For pharmacies, “NABP number” commonly means the NCPDP Provider ID. NABP no longer assigns a distinct pharmacy number.',
    outputs: {
      csv: relativeToApp(csvFile),
      jsonl: relativeToApp(jsonlFile),
      zipCoverage: relativeToApp(coverageFile),
    },
  };
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  onProgress(96, `Wrote ${retailRecords.toLocaleString('en-US')} retail pharmacy records`);
  return {
    kind: 'retail_pharmacy_directory',
    ...manifest,
    manifest: relativeToApp(manifestFile),
    summary: {
      items: retailRecords,
      enriched: enrichedRecords,
      missingPlus4,
      zipCodesWithResults: rowsByZip.size,
    },
  };
}
