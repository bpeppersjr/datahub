import {readExactZipIndustryEvidenceWithTemporalQualification as readExactZipIndustryEvidence} from './exact-zip-industry-temporal-qualification.mjs';
import {VERSION as EXACT_ZIP_VERSION} from './national-exact-zip-industry-evidence-matrix.mjs';
import {readZctaDemographicReadiness} from './zcta-demographic-readiness-reader.mjs';

const check=value=>{if(!value)throw Error('ZIP industry and demographic cross-view is unavailable or incompatible.');};

export async function readZipIndustryDemographicCrossView({
 zip5,
 root,
 signal,
 readIndustry=readExactZipIndustryEvidence,
 readDemographic=readZctaDemographicReadiness
}={}){
 check(/^\d{5}$/.test(zip5??''));
 signal?.throwIfAborted();
 const industry=await readIndustry({zip5,root,signal});
 signal?.throwIfAborted();
 check(industry?.status==='present'&&industry.schema_version===EXACT_ZIP_VERSION);
 const row=industry.row;
 let status='available',demographic=null;
 if(!row)status='unavailable-exact-zip-evidence';
 else if(row.zip5!==zip5)throw Error('ZIP industry and demographic cross-view is unavailable or incompatible.');
 else if(row.zcta_geoid!==zip5)status='not-applicable-no-same-code-zcta';
 else{
  const view=await readDemographic({zcta:zip5,root,signal});
  signal?.throwIfAborted();
  check(view?.schema_version==='zcta-demographic-readiness-view@1.0.0'&&view.zcta===zip5);
  if(view.available&&view.status==='found'&&view.readiness){
   demographic={
    status:view.readiness.status,
    population_2020:view.readiness.population_2020,
    housing_units_2020:view.readiness.housing_units_2020,
    availability:{...view.readiness.availability},
    blockers:[...view.readiness.blockers],
    provenance:{...view.provenance}
   };
  }else if(view.available===false&&view.status==='not-found'&&view.readiness===null)status='unavailable-demographic-context';
  else throw Error('ZIP industry and demographic cross-view is unavailable or incompatible.');
 }
 return {
  schema_version:'zip-industry-demographic-cross-view@1.0.0',
  zip5,
  status,
  zcta_geoid:row?.zcta_geoid??null,
  industry_evidence:industry,
  demographic_context:demographic,
  semantics:{
   geography:'Source-reported ZIP5 and Census ZCTA are distinct; demographic context is joined only for an exact same-code governed ZCTA.',
   industry:'Cells preserve source-specific measures and temporal status; they are nonadditive and do not establish all-business completeness or current operation.',
   demographic:'Population and housing are 2020 Census aggregate context only, not current estimates, demographic shares, or allocation weights.'
  },
  claims:{
   same_code_zcta_required:true,
   ratios_computed:false,
   cross_industry_total:false,
   numeric_gdp:false,
   demographic_shares:false,
   authoritative_usps_validity:null,
   network_requests:0,
   acquisition_performed:false,
   current_pointer_written:false,
   production_enrollment:false
  }
 };
}
