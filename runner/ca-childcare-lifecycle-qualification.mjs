export const CA_CHILDCARE_LIFECYCLE_QUALIFICATION_VERSION='ca-childcare-lifecycle-qualification@1.0.0';

const OPEN_CANDIDATES=new Set(['LICENSED','ON PROBATION']);
const NONOPEN=new Set(['CLOSED','INACTIVE']);
const SUPPORTED=new Set([...OPEN_CANDIDATES,...NONOPEN,'PENDING']);
const check=(value,message)=>{if(!value)throw Error(`California childcare lifecycle qualification rejected: ${message}`)};
const dateQuality=value=>{
  check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')==='iso_date|raw|reason','date shape');
  if(value.iso_date!==null){check(typeof value.iso_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.iso_date)&&value.reason===null,'parsed date');return'parsed'}
  check(value.raw===null||typeof value.raw==='string','raw date');check(typeof value.reason==='string'&&value.reason.length>0,'date reason');
  return value.raw===null?'missing':'unparsed-or-invalid';
};

export function qualifyCaChildcareLifecycle(record){
  check(record&&typeof record==='object'&&!Array.isArray(record),'record');
  const status=record.source_status?.status_source;
  check(typeof status==='string'&&SUPPORTED.has(status),'unsupported publisher status');
  const closedDateQuality=dateQuality(record.temporal?.closed_date),fileDateQuality=dateQuality(record.temporal?.file_date),licenseFirstDateQuality=dateQuality(record.temporal?.license_first_date);
  const hasClosedDate=record.temporal.closed_date.iso_date!==null;
  let qualification;
  if(OPEN_CANDIDATES.has(status))qualification=hasClosedDate?'contradictory-publisher-lifecycle-evidence':'publisher-open-status-candidate';
  else if(NONOPEN.has(status))qualification='publisher-nonopen-status';
  else qualification=hasClosedDate?'contradictory-publisher-lifecycle-evidence':'publisher-pending-status';
  return{schema_version:CA_CHILDCARE_LIFECYCLE_QUALIFICATION_VERSION,qualification,publisher_status:status,date_quality:{file_date:fileDateQuality,license_first_date:licenseFirstDateQuality,closed_date:closedDateQuality},claims:{current_operation_verified:false,active_business_verified:false,physical_site_verified:false}};
}
