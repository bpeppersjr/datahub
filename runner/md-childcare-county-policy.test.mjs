import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMdCountyOverlayPolicyDocument, loadMdCountyOverlayAuthorization, mdCountyOverlayBindings,
  reverifyMdCountyOverlayAuthorization } from './md-childcare-county-policy.mjs';
const policy = JSON.parse(await readFile(new URL('../config/source-policies/md-childcare-county-derivation-internal.json', import.meta.url), 'utf8'));

test('MD county policy requires the complete exact separate policy and unchanged source pins', () => {
  assert.equal(validateMdCountyOverlayPolicyDocument(policy), true);
  assert.equal(validateMdCountyOverlayPolicyDocument(Object.fromEntries(Object.entries(policy).reverse())), true);
  for (const mutate of [p => { p.public_export_authorized = true; }, p => { p.source_candidate_rows++; },
    p => { p.historical_policy.sha256 = '0'.repeat(64); }, p => { p.prerequisite.sha256 = '0'.repeat(64); },
    p => { p.item_payload_sha256 = '0'.repeat(64); }, p => { p.attribution.pop(); },
    p => { p.extra = true; }, p => { delete p.metadata_retention; }]) {
    const changed = structuredClone(policy); mutate(changed); assert.throws(() => validateMdCountyOverlayPolicyDocument(changed));
  }
});
test('MD policy rejects executable/inherited/deep inputs and forged authorization before source work', async () => {
  let accessed = false;
  const getter = {}; Object.defineProperty(getter, 'policy_id', { get() { accessed = true; return policy.policy_id; } });
  assert.throws(() => validateMdCountyOverlayPolicyDocument(getter)); assert.equal(accessed, false);
  assert.throws(() => validateMdCountyOverlayPolicyDocument(Object.create(policy)));
  const deep = {}; let nested = deep; for (let i = 0; i < 20; i++) nested = nested.child = {};
  assert.throws(() => validateMdCountyOverlayPolicyDocument(deep));
  for (const fake of [{}, Object.freeze({}), null, { policy_document_sha256: policy.policy_id }]) {
    assert.throws(() => mdCountyOverlayBindings(fake)); await assert.rejects(reverifyMdCountyOverlayAuthorization(fake));
  }
  await assert.rejects(loadMdCountyOverlayAuthorization({ root: 'C:/unapproved' }));
  await assert.rejects(loadMdCountyOverlayAuthorization({ signal: AbortSignal.abort() }));
  const options = {}; Object.defineProperty(options, 'signal', { get() { accessed = true; } });
  await assert.rejects(loadMdCountyOverlayAuthorization(options)); assert.equal(accessed, false);
});
test('native MD overlay authorization independently replays fixed retained evidence without source requests', {
  skip: !process.env.DATAHUB_TEST_RETAINED_COUNTY_MANIFEST,
}, async () => {
  const context = await loadMdCountyOverlayAuthorization(), bindings = mdCountyOverlayBindings(context);
  assert.equal(Object.isFrozen(context), true); assert.deepEqual(Object.keys(context), []);
  assert.equal(bindings.source_candidate_rows, 1772); assert.equal(bindings.source_requests, 0);
  assert.equal(bindings.original_item_observations.length, 2);
  assert.equal(bindings.original_item_observations[0].payload_sha256, policy.item_payload_sha256);
  assert.equal(bindings.public_export_authorized, false);
  bindings.source_candidate_rows = 0; bindings.original_item_observations[0].payload.licenseInfo = 'changed';
  assert.equal(mdCountyOverlayBindings(context).source_candidate_rows, 1772);
  assert.throws(() => mdCountyOverlayBindings(structuredClone(context)));
  assert.equal((await reverifyMdCountyOverlayAuthorization(context)).source_candidate_rows, 1772);
});
