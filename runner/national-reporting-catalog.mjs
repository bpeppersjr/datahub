import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson } from './mn-construction-retained-selection.mjs';

const mappings = [
  ['national-snap-retailers','usda-snap-current-retailers','usda_snap_retailers','retail-consumer'],
  ['national-nppes-organizations','cms-nppes-monthly-v2','cms_nppes_organizations','health-care'],
  ['national-fdic-bankfind','fdic-bankfind-current-structure','fdic_bankfind','financial-services'],
  ['national-ncua-quarterly','ncua-final-quarterly-call-report','ncua_quarterly_credit_unions','financial-services'],
  ['national-fmcsa-census','fmcsa-company-census-active-us-principal-office','fmcsa_active_us_company_census','transportation'],
  ['national-irs-eo-bmf',null,'irs_eo_bmf_organizations','tax-exempt-organizations'],
  ['national-epa-echo','epa-echo-exporter-active-facility','epa_echo_active_facilities','cross-industry-regulated-facilities'],
  ['national-usda-fsis','usda-fsis-active-mpi-directory','fsis_active_mpi_establishments','regulated-meat-poultry-egg-establishments'],
];
const check = value => { if (!value) throw Error('National reporting catalog rejected.'); };
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const dense = value => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index)))
    .every(descriptor=>descriptor && Object.hasOwn(descriptor,'value'));
export function validateNationalReportingCatalog(value) {
  check(exact(value,['schemaVersion','denominatorVersion','denominatorScope','predecessorScope','exportPolicy','allBusinessesPercent','sources']));
  check(value.schemaVersion === 'national-reporting-catalog@1.0.0' && value.denominatorVersion === 'national-reporting-eight@1.0.0'
    && value.denominatorScope === 'Eight enrolled national reporting datasets; not all businesses'
    && value.predecessorScope === 'Six configured nationwide collection datasets'
    && value.exportPolicy === 'local-review-only' && value.allBusinessesPercent === null && dense(value.sources) && value.sources.length === 8);
  value.sources.forEach((source,index) => {
    check(exact(source,['id','profileId','sourceKey','label','group','scope']));
    check(JSON.stringify([source.id,source.profileId,source.sourceKey,source.group]) === JSON.stringify(mappings[index]));
    for (const field of ['label','scope']) check(typeof source[field] === 'string' && source[field].trim() === source[field] && source[field].length > 0 && source[field].length <= 500);
  });
  return structuredClone(value);
}
export async function readNationalReportingCatalog({signal} = {}) {
  const meter = {}, catalog = validateNationalReportingCatalog(await mnSelectionReadJson(path.join(APP_ROOT,'config/national-reporting-sources.json'),32000,signal,meter));
  return {catalog,sha256:meter.sha256};
}
export function nationalReportingCount(value) {
  if (value === undefined || value === null) return null;
  check(Number.isSafeInteger(value) && value >= 0); return value;
}
export function summarizeNationalReportingCounts(values) {
  check(dense(values));const counts=values.map(nationalReportingCount), represented=counts.filter(value=>value !== null && value > 0).length;
  return {represented,expected:counts.length,unmeasured:counts.filter(value=>value===null).length,
    percent:counts.some(value=>value!==null)?Math.round(represented/counts.length*1000)/10:null,allBusinessesPercent:null};
}
