import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FL_RETAIL_FIELDS,
  flRetailCount,
  flRetailIds,
  flRetailPage,
  flRetailPageRoute,
} from './fl-food-retail-contract.mjs';

const json = value => Buffer.from(JSON.stringify(value));

function attributes(overrides = {}) {
  return {
    OBJECTID: 7,
    FOOD_ENTITY_NUM: '12345678',
    FE_TYPE: '0042',
    FOOD_ENTITY_NAME: 'Source Name',
    ADDRESS_LINE_1: '100 Main St',
    CITY: 'Tallahassee',
    ZIP: '32301',
    ZIP_PLUS4: '1234',
    COUNTY: 'Leon',
    IS_RETAIL: 'Y',
    IS_WHOLESALE: 'N',
    FE_DESCRIPTION: 'HIGH RISK',
    ...overrides,
  };
}

function page(features, spatialReference = { wkid: 4326, latestWkid: 4326 }) {
  return json({
    geometryType: 'esriGeometryPoint',
    spatialReference,
    features,
  });
}

test('builds a bounded deterministic page query with explicitly requested WGS84 points', () => {
  const route = flRetailPageRoute([9, 3], 1, true);
  const url = new URL(route.url);
  assert.equal(route.name, 'page-001.json');
  assert.equal(url.searchParams.get('objectIds'), '9,3');
  assert.equal(url.searchParams.get('outFields'), FL_RETAIL_FIELDS.join(','));
  assert.equal(url.searchParams.get('returnGeometry'), 'true');
  assert.equal(url.searchParams.get('outSR'), '4326');
  assert.equal(url.searchParams.get('orderByFields'), 'OBJECTID ASC');
});

test('retains source-native classification and maps ArcGIS x/y to guarded longitude/latitude', () => {
  const [record] = flRetailPage(page([{
    attributes: attributes(),
    geometry: { x: -84.2807, y: 30.4383 },
  }]), [7], true);

  assert.deepEqual(record.classification, {
    system: 'FDACS FE_TYPE',
    code: '0042',
    label: null,
    groceryMappingVerified: false,
  });
  assert.deepEqual(record.geocode, {
    latitude: 30.4383,
    longitude: -84.2807,
    crs: 'EPSG:4326',
    accuracy: null,
    countyAssignmentEligible: false,
  });
  assert.equal(record.pointStatus, 'publisher-point-unverified-address');
  assert.deepEqual(record.postal, {
    zip5: '32301',
    zip4: '1234',
    sourceZip: '32301',
    sourceZip4: '1234',
  });
  assert.equal(record.currentOperationsVerified, false);
  assert.equal(record.identityReconciled, false);
});

test('does not turn missing or out-of-range publisher points into geocodes', () => {
  const records = flRetailPage(page([
    { attributes: attributes({ OBJECTID: 7 }), geometry: null },
    { attributes: attributes({ OBJECTID: 8 }), geometry: { x: -181, y: 30 } },
    { attributes: attributes({ OBJECTID: 9 }), geometry: { x: -84, y: 91 } },
  ]), [7, 8, 9], true);

  assert.deepEqual(records.map(record => record.geocode), [null, null, null]);
  assert.deepEqual(records.map(record => record.pointStatus), [
    'source-point-missing',
    'invalid-source-point',
    'invalid-source-point',
  ]);
});

test('rejects point pages unless the response declares WGS84', () => {
  const feature = { attributes: attributes(), geometry: { x: -84, y: 30 } };
  assert.throws(() => flRetailPage(page([feature], { wkid: 3857 }), [7], true), /source contract rejected/);
  assert.throws(() => flRetailPage(json({ geometryType: 'esriGeometryPolyline', spatialReference: { wkid: 4326 }, features: [feature] }), [7], true), /source contract rejected/);
});

test('accepts validated response metadata while geometry is intentionally not requested', () => {
  const raw = page([{ attributes: attributes() }]);
  const [record] = flRetailPage(raw, [7], false);
  assert.equal(record.geocode, null);
  assert.equal(record.pointStatus, 'not-requested');
  assert.throws(() => flRetailPage(page([{ attributes: attributes() }], { wkid: 3857 }), [7], false), /source contract rejected/);
});

test('keeps ZIP5 and ZIP4 separate and nulls nonconforming normalized values', () => {
  const [record] = flRetailPage(page([{
    attributes: attributes({ ZIP: '32301-', ZIP_PLUS4: '12A4' }),
    geometry: null,
  }]), [7], true);
  assert.equal(record.postal.zip5, null);
  assert.equal(record.postal.zip4, null);
  assert.equal(record.postal.sourceZip, '32301-');
  assert.equal(record.postal.sourceZip4, '12A4');
});

test('validates count and stable unique object-id inventory boundaries', () => {
  assert.equal(flRetailCount(json({ count: 2 })), 2);
  assert.deepEqual(flRetailIds(json({ objectIdFieldName: 'OBJECTID', objectIds: [9, 3] }), 2), [3, 9]);
  assert.throws(() => flRetailIds(json({ objectIdFieldName: 'OBJECTID', objectIds: [3, 3] }), 2), /source contract rejected/);
  assert.throws(() => flRetailCount(json({ count: 50001 })), /source contract rejected/);
});
