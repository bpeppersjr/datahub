import test from 'node:test';
import assert from 'node:assert/strict';
import { selectIaChildcareRows as select, validateIaChildcareSelection as validate, IA_CHILDCARE_SELECTION_FIELDS as FIELDS } from './ia-childcare-selection.mjs';
const center = extra => ({businessType:'building',businessName:'  Exact Name  ',address:'Example street',city:'Example city',zipCode:50301,latitude:41.2,longitude:-93.2,referral:false,...extra});
test('Iowa selection strips nonwhitelisted and excluded values while preserving exact selected primitives',async()=>{
  const result=await select([{businessType:'home',businessName:'PRIVATE_HOME',address:'PRIVATE_HOME_ADDRESS',phone:'PRIVATE_PHONE'},center({id:'PRIVATE_ID',phone:'PRIVATE_PHONE',hidden:'PRIVATE_HIDDEN'})]);
  assert.deepEqual(result.counts,{source_rows:2,selected_rows:1,excluded_rows:1,duplicate_selected_rows:0});
  assert.equal(result.rows[0].source_ordinal,2); assert.equal(result.rows[0].source.businessName,'  Exact Name  ');
  assert.equal(result.rows[0].source.referral,false); assert.equal(result.rows[0].source.zipCode,50301);
  assert.deepEqual(Object.keys(result.rows[0].source),FIELDS);
  assert.ok(!JSON.stringify(result).includes('PRIVATE')); assert.deepEqual(await validate(result),result);
});
test('Iowa keeps duplicates and release ordinals, fills missing with null, and does not normalize numeric ZIPs or points',async()=>{
  const row=center({zipCode:123.4,latitude:999,longitude:-999});
  const result=await select([row,{businessType:'home'},row,{businessType:'building'}]);
  assert.deepEqual(result.rows.map(x=>x.source_ordinal),[1,3,4]); assert.equal(result.counts.duplicate_selected_rows,1);
  assert.equal(result.rows[0].source.zipCode,123.4); assert.equal(result.rows[0].source.latitude,999);
  assert.ok(FIELDS.slice(1).every(key=>result.rows[2].source[key]===null)); assert.deepEqual(await validate(result),result);
  assert.deepEqual(await validate(JSON.parse(JSON.stringify(result))),result);
  for(const key of ['zipCode','latitude','longitude']) await assert.rejects(select([center({[key]:-0})]),/selection rejected/);
});
test('Iowa rejects wrong types, accessors, inherited fields, malformed rows and overlimits with redacted errors',async()=>{
  const canary=()=>{throw new Error('PRIVATE_CANARY');};
  const wrong=[null,{},Array(10001).fill({}),[null],[Object.create(center())],[{businessType:'building',get phone(){canary();}}],[center({businessName:1})],[center({latitude:'41'})],[center({referral:'false'})],[center({zipCode:Infinity})],[center({zipCode:'50301'})],[center({city:'x'.repeat(2001)})],[center({businessName:undefined})]];
  const sparse=[]; sparse.length=1; wrong.push(sparse);
  for(const value of wrong) await assert.rejects(select(value),error=>error.message==='Iowa childcare selection rejected.');
  await assert.rejects(select(Array(2000).fill(center({address:'x'.repeat(2000),city:'y'.repeat(2000)}))),/selection rejected/);
});
test('Iowa replay rejects extra values, ordinal tampering, count and duplicate mismatch',async()=>{
  const good=await select([center(),{businessType:'home'},center()]);
  const mutations=[value=>{value.extra='PRIVATE';},value=>{value.rows[0].source.phone='PRIVATE';},value=>{value.rows[1].source_ordinal=1;},value=>{value.rows[0].source_ordinal=0;},value=>{value.rows[0].source_ordinal=4;},value=>{value.counts.source_rows=2;},value=>{value.counts.excluded_rows=0;},value=>{value.counts.duplicate_selected_rows=0;},value=>{delete value.rows[0].source.city;}];
  for(const mutation of mutations){const value=structuredClone(good);mutation(value);await assert.rejects(validate(value),/selection rejected/);}
});
test('Iowa cancellation and exact options fail closed; caller mutations after dispatch cannot alter snapshot',async()=>{
  const controller=new AbortController(); controller.abort('PRIVATE_REASON');
  await assert.rejects(select([center()],{signal:controller.signal}),/selection rejected/);
  await assert.rejects(validate({rows:[],counts:{}},{signal:controller.signal}),/selection rejected/);
  await assert.rejects(select([],{url:'PRIVATE'}),/selection rejected/);
  const during=new AbortController(), pending=select(Array(1000).fill(center()),{signal:during.signal}); during.abort(); await assert.rejects(pending,/selection rejected/);
  const input=[center()], original=input[0].businessName, copy=select(input); input[0].businessName='MUTATED';
  assert.equal((await copy).rows[0].source.businessName,original);
  const value=await select([center()]), replay=validate(value);value.rows[0].source.businessName='MUTATED';assert.equal((await replay).rows[0].source.businessName,original);
});
