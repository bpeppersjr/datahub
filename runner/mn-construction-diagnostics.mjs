// Diagnostics contain only fixed classifications, never provider/parser text,
// row values, paths, response bodies, or arbitrary Error properties.
import { CsvError } from 'csv-parse';
const csvCodes = new Map([
  ['CSV_RECORD_INCONSISTENT_COLUMNS','source-csv-column-count'],
  ['CSV_RECORD_INCONSISTENT_FIELDS_LENGTH','source-csv-column-count'],
  ['CSV_QUOTE_NOT_CLOSED','source-csv-unclosed-quote'],
  ['INVALID_OPENING_QUOTE','source-csv-opening-quote'],
  ['CSV_INVALID_CLOSING_QUOTE','source-csv-closing-quote'],
  ['CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE','source-csv-closing-quote'],
  ['CSV_MAX_RECORD_SIZE','source-csv-record-limit'],
]);
const codes = new Set(['source-utf8-invalid','source-byte-limit','source-csv-invalid','selected-frame-failed',
  'source-stream-failed','transport-request-failed','transport-body-failed','transport-final-check-failed',
  'retained-selection-failed','acquisition-selection-failed','app-finalization-failed','source-csv-header-mismatch',...csvCodes.values()]);
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

// Interpret only known parser error types and fixed code mappings. Neither the
// parser message nor its record/field context crosses this boundary. Codes on
// arbitrary transport or sink Errors do not impersonate parser diagnostics.
export function mnConstructionCsvFailure(error) {
  return mnConstructionFailure(error,error instanceof CsvError ? csvCodes.get(error.code) ?? 'source-csv-invalid' : 'source-stream-failed');
}
