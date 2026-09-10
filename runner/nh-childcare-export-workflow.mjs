import { profileNhSearchExport, NH_EXPORT_LIMITS } from './nh-childcare-export-profile.mjs';

export const NH_SEARCH_SCOPE = Object.freeze({ url: 'https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch',
  programType: 'Licensed Group Child Care Program', zip5: '03755', exportName: 'SearchResults.csv' });
const invalid = () => new Error('New Hampshire bounded public-search prerequisite did not complete.');
export function nhSearchResultCount(text) {
  const match = typeof text === 'string' && text.trim().match(/^(?:Successfully fetched\s+)?(\d+)\s+results?(?:\s+found)?[.!]?$/i);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
}

// Transport-neutral for offline adversarial testing. This is not a native
// receipt publisher: only the fixed CLI owns the browser and publication.
export async function inspectNhSearchExport(ui, { signal } = {}) {
  const check = () => signal?.throwIfAborted();
  try {
    check(); await ui.open(NH_SEARCH_SCOPE.url);
    check(); await ui.select(NH_SEARCH_SCOPE.programType, NH_SEARCH_SCOPE.zip5);
    check(); await ui.search();
    check(); const state = await ui.state();
    if (state.programType !== NH_SEARCH_SCOPE.programType || state.zip5 !== NH_SEARCH_SCOPE.zip5
      || state.completed !== true || !Number.isSafeInteger(state.displayedRows) || state.displayedRows < 1
      || state.displayedRows > NH_EXPORT_LIMITS.rows || state.visibleRows !== state.displayedRows
      || state.exportControls !== 1) throw invalid();
    check(); const download = await ui.download();
    if (download.filename !== NH_SEARCH_SCOPE.exportName || download.count !== 1) throw invalid();
    check(); const result = profileNhSearchExport(download.bytes, { displayedRows: state.displayedRows, signal });
    const after = await ui.state();
    if (JSON.stringify(after) !== JSON.stringify(state)) throw invalid();
    check(); return { displayed_rows: state.displayedRows, profile: result };
  } catch (cause) {
    const failure = invalid();
    if (['NH_EXPORT_acceptance-limits', 'NH_EXPORT_csv-syntax', 'NH_EXPORT_schema-or-row-count', 'NH_EXPORT_encoding-or-content'].includes(cause?.code)) failure.code = cause.code;
    throw failure;
  }
}
