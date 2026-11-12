import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import registration from '../config/datasets/ca-childcare-status-readiness.json' with {type:'json'};
import {APP_ROOT} from './paths.mjs';
import {verifyCaChildcarePreflight} from './ca-childcare-preflight.mjs';
import {verifyCaChildcareSchemaPreflight} from './ca-childcare-schema-preflight.mjs';
import {verifyCaChildcareStatusPreflight} from './ca-childcare-status-preflight.mjs';
import {verifyCaChildcareGeographyPreflight} from './ca-childcare-geography-preflight.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const check=(value,message)=>{if(!value)throw Error(`California childcare status readiness rejected: ${message}`)};
async function pinned(root,declaration,verify){
  check(declaration&&typeof declaration.path==='string'&&/^[a-f0-9]{64}$/.test(declaration.sha256),'registration');
  const file=path.resolve(root,declaration.path),relative=path.relative(root,file);
  check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'path');
  const bytes=await readFile(file);check(sha(bytes)===declaration.sha256,'manifest identity');
  return verify(file,{appRoot:root});
}

export async function readCaChildcareStatusReadiness({root=APP_ROOT}={}){
  check(root===path.resolve(root),'root');
  const [catalog,schema,status,geography]=await Promise.all([
    pinned(root,registration.manifests.catalog,verifyCaChildcarePreflight),
    pinned(root,registration.manifests.schema,verifyCaChildcareSchemaPreflight),
    pinned(root,registration.manifests.status,verifyCaChildcareStatusPreflight),
    pinned(root,registration.manifests.geography,verifyCaChildcareGeographyPreflight),
  ]);
  const statuses=Object.fromEntries(['CLOSED','INACTIVE','LICENSED','ON PROBATION','PENDING'].map(value=>[value,0]));let publisherRows=0,currentCandidates=0;
  for(const resource of status.resources){publisherRows+=resource.schema_preflight_row_total;currentCandidates+=resource.publisher_current_candidate_count;for(const row of resource.status_counts){check(Object.hasOwn(statuses,row.facility_status),'status vocabulary');statuses[row.facility_status]+=row.row_count}}
  check(publisherRows===39184&&schema.datastore.resources.reduce((sum,row)=>sum+row.row_total_at_observation,0)===publisherRows&&geography.resources.reduce((sum,row)=>sum+row.schema_preflight_row_total,0)===publisherRows,'cross-preflight conservation');
  check(Object.values(statuses).reduce((sum,value)=>sum+value,0)===publisherRows&&currentCandidates===statuses.LICENSED+statuses['ON PROBATION'],'status conservation');
  check(catalog.catalog.last_updated==='2026-11-11'&&catalog.catalog.migration.current_distribution==='ArcGIS GeoService'&&catalog.catalog.migration.legacy_childcare_distributions_still_listed===true,'migration evidence');
  return{schema_version:'ca-childcare-status-readiness-view@1.2.0',state:'CA',industry:'childcare',status:'verified-aggregate-publisher-readiness-migration-hold',publisher_rows:publisherRows,publisher_status_counts:statuses,publisher_open_status_candidate_rows:currentCandidates,temporal:{catalog_last_updated:catalog.catalog.last_updated,publisher_file_date:'2025-05-25',preflight_observed_at:status.observed_at,posture:'arcgis-current-distribution-legacy-ckan-file-date-conflict-automatic-refresh-hold',current_operation_verified:false},migration:{current_distribution:'ArcGIS GeoService',arcgis_item_id:catalog.catalog.migration.arcgis_item_id,legacy_backend_still_listed:true,existing_app_backend:'legacy-ckan-datastore',automatic_refresh_authorized:false,next_action:'Reconcile the ArcGIS layer schema, counts, lifecycle fields and selected privacy boundary before provider-row acquisition.'},source:{manifests:registration.manifests},claims:registration.claims,semantics:status.publisher_status_semantics.meaning};
}
