import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { overtureExtractionSql, overtureStreamingSql, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';

const cap = 'a'.repeat(64);
const urls = count => Array.from({ length: count }, (_, index) => `http://127.0.0.1:12345/${cap}/${index}`);
const digest = value => createHash('sha256').update(value).digest('hex');
test('legacy COPY query remains byte-for-byte unchanged and shares streaming projection', () => {
  const sql = overtureExtractionSql(['https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet'], 'C:/Master Data/datahub/data/tmp/legacy-fixture.jsonl.gz');
  if (process.platform === 'win32') assert.equal(digest(sql), '2d686680a2d188fa583f9a0a6b6cf2e7a242c12535abe9bdeab2b07b87ee1092');
  assert.equal(digest(sql.replace(/\) TO .* \(FORMAT JSON/, ') TO <DESTINATION> (FORMAT JSON')), 'b797ecf8c50d8a669b1b65d8b9eb882275a292695a41a446f1346d107ad2fe69');
  const body = sql.slice(sql.indexOf('WITH selected'), sql.indexOf('\n) TO ')).replace(/read_parquet\(\[[^\]]+\]/, 'read_parquet([ASSETS]');
  const stream = overtureStreamingSql(urls(1));
  assert.equal(stream.slice(stream.indexOf('WITH selected'), stream.lastIndexOf('\n) AS cotive_selected')).replace(/read_parquet\(\[[^\]]+\]/, 'read_parquet([ASSETS]'), body);
  assert.match(stream, /^SELECT to_json\(cotive_selected\)::VARCHAR AS record_json FROM/);
});
test('streaming SQL rejects noncanonical capabilities, hosts, indices and accessor arrays', () => {
  const accessor = []; Object.defineProperty(accessor, '0', { get() { assert.fail('getter'); } });
  const extra = urls(1); extra[Symbol('PRIVATE')] = true;
  for (const value of [[], new Array(2), accessor, extra, ['http://localhost:12345/' + cap + '/0'], [urls(1)[0] + '?PRIVATE'], [urls(1)[0].replace(':12345', ':012345')], [urls(1)[0].replace(':12345', ':65536')], [urls(1)[0].replace('http:', 'https:')], [urls(1)[0].replace(cap, cap.toUpperCase())], [urls(1)[0].replace('/0', '/1')], [urls(2)[0], urls(2)[1].replace(':12345', ':12346')]]) {
    assert.throws(() => overtureStreamingSql(value), error => !error.message.includes('PRIVATE'));
  }
});
test('fingerprint binds count and exact projection but never ephemeral capabilities', () => {
  for (const count of [1, 2, 32]) {
    const sql = overtureStreamingSql(urls(count));
    const redacted = sql.replace(/http:\/\/127\.0\.0\.1:12345\/[a-f0-9]{64}\/(\d+)/g, (_, index) => `<OVERTURE_ASSET_${index}>`);
    assert.equal(overtureStreamingQueryFingerprint(count), digest(redacted));
  }
  assert.notEqual(overtureStreamingQueryFingerprint(1), overtureStreamingQueryFingerprint(2));
  for (const value of [0, 33, '1', null, 1.5]) assert.throws(() => overtureStreamingQueryFingerprint(value));
});
