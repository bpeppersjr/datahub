import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NH_SEARCH_SCOPE as S, inspectNhSearchExport as inspect, nhSearchResultCount } from './nh-childcare-export-workflow.mjs';
import { NH_EXPORT_HEADERS as H } from './nh-childcare-export-profile.mjs';
function fake(changes = {}) {
  const calls = [];
const state = { programType: S.programType, zip5: S.zip5, completed: true, displayedRows: 1, visibleRows: 1, exportControls: 1 };
  let states = 0;
  return { calls, ui: { open: async value => { assert.equal(value, S.url); calls.push('open'); },
    select: async (type, zip) => { assert.equal(type, S.programType); assert.equal(zip, '03755'); calls.push('select'); },
    search: async () => { calls.push('search'); }, state: async () => ({ ...state, ...changes.state,
      ...(states++ ? changes.after : {}) }), download: async () => {
      calls.push('download'); if (changes.failure) throw Error('PRIVATE_SOURCE_VALUE');
      return { filename: S.exportName, count: 1, bytes: Buffer.from(`${H.join(',')}\n${H.map(() => '""').join(',')}\n`), ...changes.download };
    } } };
}
test('NH recognizes observed completion wording without accepting partial/error/stale text', () => {
  assert.equal(nhSearchResultCount('Successfully fetched 6 results'), 6);
  assert.equal(nhSearchResultCount(' 1 result found '), 1);
  for (const text of ['', 'Loading 6 results', 'Failed 6 results', 'Successfully fetched', '6 results PRIVATE', null])
    assert.equal(nhSearchResultCount(text), null);
});
test('NH flow executes only one selected UI search/export and verifies unchanged query and result counts', async () => {
  const { ui, calls } = fake(); const result = await inspect(ui);
  assert.equal(result.profile.rows, 1); assert.deepEqual(calls, ['open', 'select', 'search', 'download']);
});
test('NH flow rejects wrong/stale/ambiguous scope before download and never retries', async () => {
  for (const state of [{ programType: 'All' }, { zip5: '' }, { completed: false }, { displayedRows: 21 },
    { displayedRows: 0 }, { displayedRows: 1.5 }, { visibleRows: 2 }, { exportControls: 2 }]) {
    const { ui, calls } = fake({ state }); await assert.rejects(inspect(ui)); assert.ok(!calls.includes('download'));
  }
  for (const changes of [{ download: { filename: '../ProviderResults.csv' } }, { download: { count: 2 } },
    { download: { bytes: Buffer.alloc(262145) } }, { after: { zip5: '90210' } }, { failure: true }]) {
    const { ui, calls } = fake(changes);
    await assert.rejects(inspect(ui), error => !error.message.includes('PRIVATE'));
    assert.equal(calls.filter(value => value === 'download').length, 1);
  }
  const { ui, calls } = fake(); await assert.rejects(inspect(ui, { signal: AbortSignal.abort() }));
  assert.deepEqual(calls, []);
});
