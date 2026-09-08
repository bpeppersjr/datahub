import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { MN_CONSTRUCTION_EXPORTS } from './mn-construction-preflight.mjs';
import { MN_CONSTRUCTION_TRANSFORMATION } from './mn-construction-normalization.mjs';

export const MN_CONSTRUCTION_CREDENTIAL_REPORTING_VERSION = 'mn-construction-credential-reporting@1.0.0';
const fail=()=>{throw new Error('Minnesota credential reporting record rejected.');};
const check=value=>{if(!value)fail();};
const states=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI AA AE AP'.split(' '));
const classes={IR:['registration','construction-contractor-registration'],BC:['license','residential-building-contractor'],CR:['license','residential-remodeler'],RR:['license','residential-roofer'],MI:['license','manufactured-home-installer']};
function exact(value,keys){
  check(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
  check(Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
  for(const key of keys)check(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
function text(value,maximum,nullable=true){
  if(nullable&&value===null)return;
  check(typeof value==='string'&&value.length>0&&value.length<=maximum&&value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value));
  check(Buffer.from(value,'utf8').toString('utf8')===value);
}
const same=(value,expected)=>check(isDeepStrictEqual(value,expected));
function validateNormalized(record){
  exact(record,['schema_version','dataset_id','source_record_id','business_name','dba_name','external_identifiers','credential','reported_address','geocode','industry','affiliation','provenance','quality','export_policy']);
  check(record.schema_version==='1.0.0'&&record.dataset_id==='mn-dli-construction-business-credentials'&&record.export_policy==='local-review-only');
  text(record.business_name,500,false);text(record.dba_name,500);
  check(Array.isArray(record.external_identifiers)&&record.external_identifiers.length===1&&Reflect.ownKeys(record.external_identifiers).length===2);
  check(Object.hasOwn(Object.getOwnPropertyDescriptor(record.external_identifiers,'0')??{},'value'));
  const identifier=record.external_identifiers[0];exact(identifier,['type','value']);
  check(identifier.type==='minnesota_dli_construction_credential'&&typeof identifier.value==='string'&&/^(IR|BC|CR|RR|MI)\d{6}$/.test(identifier.value));
  const prefix=identifier.value.slice(0,2),cohort=prefix==='IR'?'registrations':'residential';
  const credential=record.credential;
  exact(credential,['kind','category','status_source','active_credential_basis','active_business_verified','original_date_source','expiration_date_source','date_semantics']);
  check(credential.kind===classes[prefix][0]&&credential.category===classes[prefix][1]&&credential.status_source==='Issued'
    &&credential.active_credential_basis==='publisher-status-at-observation'&&credential.active_business_verified===false&&credential.date_semantics==='unparsed-publisher-values-not-business-lifecycle');
  text(credential.original_date_source,100);text(credential.expiration_date_source,100);
  const address=record.reported_address;
  exact(address,['street','street2','city','state','country','country_basis','zip_code','postal_code','zip4','address_role','physical_location_verified']);
  text(address.street,500);text(address.street2,500);text(address.city,100);text(address.state,100);
  const recognized=states.has(address.state);
  check(address.country===(recognized?'US':null)&&address.country_basis===(recognized?'recognized-source-state-code-not-boundary-validation':'unresolved'));
  check(address.address_role==='publisher-reported-role-unresolved'&&address.physical_location_verified===false);
  check(address.zip_code===null||recognized&&typeof address.zip_code==='string'&&/^\d{5}$/.test(address.zip_code)&&address.zip_code!=='00000');
  check(address.postal_code===address.zip_code&&(address.zip4===null||address.zip_code!==null&&typeof address.zip4==='string'&&/^\d{4}$/.test(address.zip4)));
  exact(record.geocode,['latitude','longitude','status','address_role']);
  exact(record.industry,['category','naics_code','basis']);exact(record.affiliation,['parent_company','ownership_verified']);
  same(record.geocode,{latitude:null,longitude:null,status:'not-provided-by-source',address_role:'unresolved'});
  same(record.industry,{category:'construction',naics_code:null,basis:'credential-program-not-verified-establishment-classification'});
  same(record.affiliation,{parent_company:null,ownership_verified:false});
  const provenance=record.provenance;
  exact(provenance,['source_url','source_release_id','source_file_sha256','source_row_number','selected_fields_sha256','ingest_run_id','observed_at','transformation_version','attribution']);
  for(const key of ['source_release_id','ingest_run_id'])check(typeof provenance[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(provenance[key]));
  for(const key of ['source_file_sha256','selected_fields_sha256'])check(typeof provenance[key]==='string'&&/^[a-f0-9]{64}$/.test(provenance[key]));
  check(Number.isSafeInteger(provenance.source_row_number)&&provenance.source_row_number>0);
  check(record.source_record_id===`${provenance.source_release_id}:${cohort}:row:${provenance.source_row_number}`);
  check(provenance.source_url===MN_CONSTRUCTION_EXPORTS[cohort==='registrations'?0:1]&&provenance.transformation_version===MN_CONSTRUCTION_TRANSFORMATION
    &&provenance.attribution==='Minnesota Department of Labor and Industry, Construction Codes and Licensing Division');
  check(typeof provenance.observed_at==='string'&&Number.isFinite(Date.parse(provenance.observed_at))&&new Date(provenance.observed_at).toISOString()===provenance.observed_at);
  const quality=record.quality;
  exact(quality,['unique_business_identity_verified','current_usps_validity','geographic_boundary_verified','postal_status','physical_site_eligible','matching_eligible']);
  check(quality.unique_business_identity_verified===false&&quality.current_usps_validity==='unverified'&&quality.geographic_boundary_verified===false&&quality.physical_site_eligible===false&&quality.matching_eligible===false);
  check(address.zip_code===null?['missing','unresolved-or-invalid'].includes(quality.postal_status):quality.postal_status==='format-only');
}

/** Pure projection of a verified normalized row. Source membership/hash authenticity
 * must be established by the retained input loader, not by this structural check. */
export function projectMnConstructionCredential(record){
  validateNormalized(record);
  return {schema_version:MN_CONSTRUCTION_CREDENTIAL_REPORTING_VERSION,
    reporting_id:'mn-construction-credential:'+createHash('sha256').update(JSON.stringify([record.provenance.source_release_id,record.source_record_id])).digest('hex'),
    publisher_jurisdiction:'MN',record:structuredClone(record),
    claims:{record_unit:'publisher-business-credential-row',matching_eligible:false,physical_site_eligible:false,unique_business_identity_verified:false,public_export_authorized:false,national_reporting_integrated:false}};
}

/** Exact projection replay; output extensions and widened claims fail closed. */
export function validateMnConstructionCredentialReporting(record){
  exact(record,['schema_version','reporting_id','publisher_jurisdiction','record','claims']);
  exact(record.claims,['record_unit','matching_eligible','physical_site_eligible','unique_business_identity_verified','public_export_authorized','national_reporting_integrated']);
  same(record,projectMnConstructionCredential(record.record));
  return record;
}
