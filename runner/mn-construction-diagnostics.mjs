// Diagnostics contain only fixed classifications, never provider/parser text,
// row values, paths, response bodies, or arbitrary Error properties.
const codes = new Set(['source-utf8-invalid','source-byte-limit','source-csv-invalid','selected-frame-failed',
  'source-stream-failed','transport-request-failed','transport-body-failed','transport-final-check-failed',
  'retained-selection-failed','acquisition-selection-failed','app-finalization-failed']);
const classified = new WeakMap();
export function mnConstructionFailure(error, fallback) {
  if (!codes.has(fallback)) throw new Error('Invalid Minnesota diagnostic classification.');
  const result = new Error('Minnesota operation failed; inspect its bounded diagnostic.');
  classified.set(result, classified.get(error) ?? fallback);
  return result;
}
export function mnConstructionDiagnostic(error) {
  return classified.get(error) ?? 'app-finalization-failed';
}
export function validMnConstructionDiagnostic(value) { return codes.has(value); }
