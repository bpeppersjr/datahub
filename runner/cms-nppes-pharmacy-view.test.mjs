import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsNppesPharmacyView } from './cms-nppes-pharmacy-view.mjs';

test('pharmacy view rejects overlong queries before attempting to load a release', async () => {
  const view = createCmsNppesPharmacyView({ pointerPath: 'data/tmp/does-not-exist-pharmacy/current.json' });
  await assert.rejects(view.get({ query: 'x'.repeat(101) }), (error) => error.statusCode === 400 && /100 characters/.test(error.message));
});
