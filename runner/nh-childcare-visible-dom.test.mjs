import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';
import { projectNhVisibleCards } from './nh-childcare-visible-dom.mjs';
import { profileNhVisibleResults, NH_VISIBLE_SCOPE as S } from './nh-childcare-visible-results.mjs';

test('NH offline browser validates two-column visible cards, privacy boundaries and ambiguity', {
  skip: process.env.DATAHUB_TEST_NH_VISIBLE_DOM !== '1', timeout: 45000,
}, async () => {
  const root = path.join(APP_ROOT, 'data/tmp/nh-visible-dom-tests'), id = randomUUID(), directory = path.join(root, id);
  await canonical(root, { create: true, output: true }); await mkdir(directory); const owner = await lstat(directory);
  const previous = Object.fromEntries(['PLAYWRIGHT_BROWSERS_PATH', 'TEMP', 'TMP', 'TMPDIR'].map(key => [key, process.env[key]]));
  let context, closed = false, routed = 0;
  try {
    for (const name of ['profile', 'temp', 'downloads', 'artifacts']) await mkdir(path.join(directory, name));
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(APP_ROOT, '.playwright-browsers');
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = path.join(directory, 'temp');
    const { chromium } = await import('playwright');
    context = await chromium.launchPersistentContext(path.join(directory, 'profile'), { headless: true, acceptDownloads: false,
      serviceWorkers: 'block', timeout: 20000, downloadsPath: path.join(directory, 'downloads'), artifactsDir: path.join(directory, 'artifacts'), env: { ...process.env } });
    await context.route('**/*', async route => { routed++; await route.abort(); });
    const page = context.pages()[0] ?? await context.newPage();
    const business = '<div class="slds-tile__detail"><p><a href="https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=fixture1">Example Center<span class="sr-only">PRIVATE_ACCESSIBILITY</span><span aria-hidden="true">→</span></a></p><br><div>1 Example Street,<br>Hanover, NH 03755-0123</div><br><div><a href="https://www.google.com/maps/place/PRIVATE">PRIVATE_DIRECTIONS</a></div></div>';
    const contact = '<div class="slds-tile__detail"><p><span><a href="tel:PRIVATE_PHONE">PRIVATE_PHONE</a></span></p><div>PRIVATE_CONTACT</div></div>';
    const wrap = content => '<style>.sr-only{display:none}</style><ul class="result-list"><li><article><div class="slds-grid">' + content + '</div></article></li></ul>';
    const project = async content => { await page.setContent(wrap(content)); return page.locator('ul.result-list:visible').evaluateAll(projectNhVisibleCards); };
    for (const content of [business + contact, contact + business]) {
      const result = await project(content); assert.equal(result.length, 1); assert.equal(result[0].rejection, undefined);
      assert.equal(result[0].row.name, 'Example Center'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
      const normalized = profileNhVisibleResults({ programType: S.programType, zip5: S.zip5, completed: true, displayedRows: 1, visibleRows: 1, rows: [result[0].row] });
      assert.equal(normalized.candidates[0].address.zip5, '03755'); assert.equal(normalized.candidates[0].address.zip4, '0123');
    }
    assert.equal((await project(business + business))[0].rejection, 'ambiguous-detail-parent');
    assert.equal((await project(contact))[0].rejection, 'ambiguous-detail-parent');
    assert.equal((await project(business.replace('<p>', '<p><a href="tel:PRIVATE">PRIVATE</a>')))[0].rejection, 'ambiguous-name-link');
    assert.equal((await project(business.replace('1 Example Street,', '<span hidden>PRIVATE</span>1 Example Street,')))[0].rejection, 'unsupported-address-markup');
    assert.equal((await project(business.replace('<a href=', '<a style="display:none" href=')))[0].rejection, 'missing-or-hidden-field');
    assert.equal((await project(business.replace('https://new-hampshire.my.site.com/nhccis/', 'https://other.example/')))[0].rejection, 'ambiguous-detail-parent');
    assert.equal(routed, 0, 'Synthetic fixture must not request the network');
  } finally {
    try { await context?.close(); closed = true; } finally {
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      if (closed) {
        await canonical(directory); const current = await lstat(directory);
        assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev); assert.equal(current.isSymbolicLink(), false);
        assert.equal(await realpath(directory), directory); assert.equal(path.dirname(directory), root); assert.equal(path.basename(directory), id);
        await rm(directory, { recursive: true, force: false });
      }
    }
  }
});
