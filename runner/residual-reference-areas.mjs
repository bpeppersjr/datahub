import { createHash } from 'node:crypto';

export const RESIDUAL_REFERENCE_METHOD = 'component-bounds-midpoint-state-bounds-thirds@1.0.0';
export const RESIDUAL_DIRECTIONS = ['northwest', 'north', 'northeast', 'west', 'central', 'east', 'southwest', 'south', 'southeast'];
const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
export function validateResidualReferenceSelection({ offset = 0, direction = 'all' } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) invalid('Residual offset must be a nonnegative integer no greater than 1000000.');
  if (direction !== 'all' && !RESIDUAL_DIRECTIONS.includes(direction)) invalid('Unsupported residual reference direction.');
  return { offset, direction };
}
const polygons = geometry => {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw Error('Invalid retained residual geometry.');
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
};
function bounds(rings, unwrap) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw Error('Invalid retained residual coordinates.');
    const longitude = unwrap(point[0]);
    box[0] = Math.min(box[0], longitude); box[1] = Math.min(box[1], point[1]);
    box[2] = Math.max(box[2], longitude); box[3] = Math.max(box[3], point[1]);
  }
  if (!box.every(Number.isFinite)) throw Error('Empty retained residual component.');
  return box;
}
function longitudeFrame(statePolygons) {
  const values = [...new Set(statePolygons.flatMap(rings => rings.flatMap(ring => ring.map(point => ((point[0] % 360) + 360) % 360))))].sort((a, b) => a - b);
  if (!values.length) throw Error('Empty retained state geometry.');
  let start = values[0], gap = -1;
  for (let index = 0; index < values.length; index++) {
    const next = values[(index + 1) % values.length] + (index + 1 === values.length ? 360 : 0);
    if (next - values[index] > gap) { gap = next - values[index]; start = next % 360; }
  }
  return value => { const normalized = ((value % 360) + 360) % 360; return normalized < start ? normalized + 360 : normalized; };
}
// Direction is an orientation reference, never a centroid, land class or ZIP assignment.
export function buildResidualReferenceAreas({ state, stateGeometry, residualGeometry, offset = 0, direction = 'all' }) {
  validateResidualReferenceSelection({ offset, direction });
  if (!/^[A-Z]{2}$/.test(state?.state_abbreviation) || typeof state.state_name !== 'string') throw Error('Invalid retained residual state.');
  const statePolygons = polygons(stateGeometry), residualPolygons = polygons(residualGeometry), unwrap = longitudeFrame(statePolygons);
  const stateBounds = bounds(statePolygons.flatMap(rings => rings), unwrap), counts = Object.fromEntries(RESIDUAL_DIRECTIONS.map(key => [key, 0]));
  const band = (value, low, high) => high === low ? 1 : Math.min(2, Math.max(0, Math.floor((value - low) / (high - low) * 3)));
  const names = [['southwest', 'south', 'southeast'], ['west', 'central', 'east'], ['northwest', 'north', 'northeast']];
  const seen = new Set();
  const rows = residualPolygons.map(rings => {
    const box = bounds(rings, unwrap), x = (box[0] + box[2]) / 2, y = (box[1] + box[3]) / 2;
    const orientation = names[band(y, stateBounds[1], stateBounds[3])][band(x, stateBounds[0], stateBounds[2])];
    const digest = createHash('sha256').update(JSON.stringify(rings)).digest('hex'), id = `${state.state_abbreviation}-unresolved-${digest}`;
    if (seen.has(id)) throw Error('Duplicate retained residual component.');
    seen.add(id); counts[orientation]++;
    return { id, label: `${state.state_name} · ${orientation} · unresolved area ${digest.slice(0, 12)}`, direction: orientation, reference_bounds: box };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const selected = direction === 'all' ? rows : rows.filter(row => row.direction === direction), page = selected.slice(offset, offset + 100);
  return { method: RESIDUAL_REFERENCE_METHOD, component_count: rows.length, direction_counts: counts, direction, offset, page_size: 100, selected_count: selected.length, next_offset: offset + page.length < selected.length ? offset + page.length : null, rows: page,
    semantics: 'Each ID identifies a polygon component in this immutable residual artifact. Direction uses its bounding-box midpoint in thirds of the retained state bounds, with longitude unwrapped across the antimeridian. It is an orientation reference, not a centroid, ZIP boundary, population value, land classification or business gap. Components spanning regions keep one reference label.' };
}
