import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResidualReferenceAreas, RESIDUAL_DIRECTIONS, validateResidualReferenceSelection } from './residual-reference-areas.mjs';

const box = (x,y,width=0.1) => [[[x,y],[x+width,y],[x+width,y+width],[x,y+width],[x,y]]];
const state = { state_abbreviation:'MN', state_name:'Minnesota' };
const options = { state, stateGeometry:{type:'Polygon',coordinates:box(-99,40,9)}, residualGeometry:{type:'MultiPolygon',coordinates:[box(-98,41),box(-95,41),box(-92,41),box(-98,44),box(-95,44),box(-92,44),box(-98,47),box(-95,47),box(-92,47)]} };

test('labels conserve components, distinguish nine state-relative directions and preserve geometry identity',()=>{
  const view=buildResidualReferenceAreas(options);
  assert.equal(view.component_count,9);
  assert.deepEqual(Object.fromEntries(RESIDUAL_DIRECTIONS.map(key=>[key,1])),view.direction_counts);
  assert.equal(new Set(view.rows.map(row=>row.id)).size,9);
  for(const row of view.rows){assert.match(row.id,/^MN-unresolved-[a-f0-9]{64}$/);assert.match(row.label,new RegExp(`Minnesota · ${row.direction} · unresolved area`));assert.equal(row.reference_bounds.length,4)}
  const reordered=buildResidualReferenceAreas({...options,residualGeometry:{...options.residualGeometry,coordinates:[...options.residualGeometry.coordinates].reverse()}});
  assert.deepEqual(reordered.rows,view.rows);
  assert.match(view.semantics,/not a centroid, ZIP boundary, population value, land classification or business gap/);
});
test('longitude unwrap gives meaningful directions for geometry crossing the antimeridian',()=>{
  const result=buildResidualReferenceAreas({state:{state_abbreviation:'AK',state_name:'Alaska'},stateGeometry:{type:'MultiPolygon',coordinates:[box(170,50,5),box(-179,50,5)]},residualGeometry:{type:'MultiPolygon',coordinates:[box(171,52),box(-176,52)]}});
  assert.deepEqual(result.rows.map(row=>row.direction).sort(),['east','west']);
  assert.equal(result.rows.some(row=>row.reference_bounds[0]>180),true);
});
test('bounded pages and direction filters expose every selected area without treating unknown as zero',()=>{
  const input={...options,residualGeometry:{type:'MultiPolygon',coordinates:Array.from({length:205},(_,i)=>box(-98+i/10000,41))}};
  const first=buildResidualReferenceAreas(input),second=buildResidualReferenceAreas({...input,offset:100}),last=buildResidualReferenceAreas({...input,offset:200});
  assert.equal(first.rows.length,100);assert.equal(first.next_offset,100);assert.equal(second.next_offset,200);assert.equal(last.rows.length,5);assert.equal(last.next_offset,null);
  assert.equal(new Set([...first.rows,...second.rows,...last.rows].map(row=>row.id)).size,205);
  const absent=buildResidualReferenceAreas({...input,direction:'north'});assert.equal(absent.selected_count,0);assert.deepEqual(absent.rows,[]);assert.equal(absent.next_offset,null);
});
test('reject malformed selections, coordinates and duplicate components',()=>{
  for(const input of [{offset:-1},{offset:1.5},{offset:1000001},{direction:'park'},{direction:'North'}])assert.throws(()=>validateResidualReferenceSelection(input));
  assert.throws(()=>buildResidualReferenceAreas({...options,residualGeometry:{type:'Point',coordinates:[0,0]}}),/Invalid retained residual geometry/);
  assert.throws(()=>buildResidualReferenceAreas({...options,residualGeometry:{type:'Polygon',coordinates:[[[181,90]]]}}),/Invalid retained residual coordinates/);
  assert.throws(()=>buildResidualReferenceAreas({...options,residualGeometry:{type:'MultiPolygon',coordinates:[box(-98,41),box(-98,41)]}}),/Duplicate retained residual component/);
});
