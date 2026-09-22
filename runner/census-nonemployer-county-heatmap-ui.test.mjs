import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Heatmap Builder has a separate accessible state-and-industry county choropleth', async () => {
  const [component, builder] = await Promise.all([
    readFile(new URL('../app/census-nonemployer-county-heatmap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(builder, /Census nonemployer county industry · annual aggregate/);
  assert.match(component, /aria-label="State or District of Columbia"/);
  assert.match(component, /aria-label="NAICS industry"/);
  assert.match(component, /saved\?\.key === selectionKey/);
  assert.match(component, /if \(!controller\.signal\.aborted && reason\?\.name !== 'AbortError'\) setFailedKey\(selectionKey\)/);
  assert.match(component, /if \(!controller\.signal\.aborted\) setSaved\(\{ key: selectionKey, value \}\)/);
  assert.match(component, /role="alert"/); assert.match(component, /role="status"/);
  assert.match(component, /outside-retained-native-universe/);
  assert.doesNotMatch(component, /BusinessNames|ZIP5|collection completeness|collection-completeness/);
  assert.match(component, /onMouseEnter=\{\(\) => setHover\(\{ key: selectionKey/);
});
