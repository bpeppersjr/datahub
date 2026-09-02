import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildRetailPharmacyDirectory } from './pharmacy-directory.mjs';
import { relativeToApp, TEMP_DIR } from './paths.mjs';

test('builds ZIP-sorted retail pharmacy outputs and applies NPI enrichment', async () => {
  await mkdir(TEMP_DIR, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(TEMP_DIR, 'pharmacy-test-'));
  try {
    const nppesFile = path.join(temporaryDirectory, 'npidata_pfile_test.csv');
    const enrichmentFile = path.join(temporaryDirectory, 'dataq-export.csv');
    const outputDirectory = path.join(temporaryDirectory, 'output');
    const headers = [
      'NPI',
      'Entity Type Code',
      'Provider Organization Name (Legal Business Name)',
      'Provider Other Organization Name',
      'Provider First Line Business Practice Location Address',
      'Provider Second Line Business Practice Location Address',
      'Provider Business Practice Location Address City Name',
      'Provider Business Practice Location Address State Name',
      'Provider Business Practice Location Address Postal Code',
      'Healthcare Provider Taxonomy Code_1',
      'Healthcare Provider Taxonomy Code_2',
    ];
    const nppes = [
      headers.join(','),
      ['1111111111', '2', 'ALPHA PHARMACY LLC', 'ALPHA RX', '10 MAIN ST', '', 'ALPHA', 'NY', '001001234', '3336C0003X', ''].join(','),
      ['2222222222', '2', 'BETA PHARMACY LLC', '', '20 OAK AVE', 'SUITE 2', 'BETA', 'NY', '00102', '3336C0003X', '3336M0002X'].join(','),
      ['3333333333', '2', 'NOT A PHARMACY', '', '30 ELM ST', '', 'GAMMA', 'NY', '00101', '207Q00000X', ''].join(','),
      ['4444444444', '2', 'NO PHYSICAL ADDRESS', '', '', '', 'GAMMA', 'NY', '00101', '3336C0003X', ''].join(','),
    ].join('\n');
    const enrichment = [
      'NPI,NCPDP Provider ID,Drive Through Flag,Mail Order Flag,Network Affiliation,Parent Organization Name',
      '2222222222,7654321,Y,N,NETWORK A,PARENT COMPANY',
    ].join('\n');
    await Promise.all([
      writeFile(nppesFile, nppes, 'utf8'),
      writeFile(enrichmentFile, enrichment, 'utf8'),
    ]);

    const result = await buildRetailPharmacyDirectory({
      config: {
        nppesFile: relativeToApp(nppesFile),
        enrichmentFile: relativeToApp(enrichmentFile),
        outputDirectory: relativeToApp(outputDirectory),
        zipStart: '00100',
        zipEnd: '00102',
      },
    });

    assert.equal(result.summary.items, 2);
    assert.equal(result.summary.enriched, 1);
    assert.equal(result.summary.missingPlus4, 1);
    const files = await readdir(outputDirectory);
    const jsonlFile = files.find((file) => file.endsWith('.jsonl'));
    const coverageFile = files.find((file) => file.startsWith('zip-coverage-'));
    const csvFile = files.find((file) => file.startsWith('retail-pharmacies-') && file.endsWith('.csv'));
    const rows = (await readFile(path.join(outputDirectory, jsonlFile), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows[0].name, 'ALPHA RX');
    assert.equal(rows[0].zipCode, '00100');
    assert.equal(rows[0].postalCode, '00100');
    assert.equal(rows[0].zip4, '1234');
    assert.equal(Object.hasOwn(rows[0], 'postalCodePlus4'), false);
    assert.equal(rows[0].driveThroughFlag, null);
    assert.equal(rows[1].nabpNbr, '7654321');
    assert.equal(rows[1].driveThroughFlag, true);
    assert.equal(rows[1].mailOrderFlag, false);
    assert.equal(rows[1].networkAffiliation, 'NETWORK A');
    assert.equal(rows[1].parentCompany, 'PARENT COMPANY');
    const csv = await readFile(path.join(outputDirectory, csvFile), 'utf8');
    assert.match(csv.split('\n')[0], /,postal_code,zip4,/);
    assert.doesNotMatch(csv.split('\n')[0], /postal_code_plus4/);
    assert.match(csv, /,00100,1234,true,/);
    const coverage = await readFile(path.join(outputDirectory, coverageFile), 'utf8');
    assert.match(coverage, /00101,0/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
