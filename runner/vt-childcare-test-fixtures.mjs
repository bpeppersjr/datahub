import {VT_CHILDCARE_FIELDS,VT_CHILDCARE_FIELD_TYPES,VT_CHILDCARE_URLS} from './vt-childcare-preflight.mjs';
import {vtChildcareRequest} from './vt-childcare-acquisition.mjs';
const descriptions={
 file_name:'Name of the working file. Used in part to track reporting period.',
 license_id:'The distinct license number for each individual provider.',
 provider_name:'',license_type:'Whether the provider is Licensed (afterschool programs, center-based programs, license family homes) or Registered (registered family homes). Different CCFAP rates apply depending on whether the program is Licensed or Registered.',
 provider_program_type:'What specific type of program the provider is.',address_1:'',address_2:'',provider_town:'',zip_code:'',county:'',
 current_license_start_date:'When the current license term began.',current_license_end_date:'When the current license term expires.',
 total_licensed_capacity:'The maximum number of children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 infant_licensed_capacity:'The maximum number of infants a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 toddler_licensed_capacity:'The maximum number of toddlers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 preschool_licensed_capacity:'The maximum number of preschoolers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 school_age_licensed_capacity:'The maximum number of school age children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.'
};
const jitter=axis=>axis+' coordinates are generated based on the address fields provided. Coordinates are slightly offset (jittered) to distinguish programs sharing the same location while preserving the overall spatial pattern. Refer to the address fields for the provider\'s exact location.';
const catalogDescription='Vermont Child Care Provider Data including location, capacity, mailing list data and contact information, updated monthly. Data reflects the number of programs in business on the final day of the last complete month prior to the most recent update.';
const license={name:'Open Database License',termsLink:'http://opendatacommons.org/licenses/odbl/1.0/'};
const owner={id:'ihpx-mmkb',displayName:'Child Development Division Data Unit'};


/** Synthetic records only; real metadata descriptions contain no provider samples. */
export function createVtChildcareFixture({count=2,mutate=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||count>20000)throw Error('Synthetic count');
 const file='Provider_Report_07012026_08012026.xlsx';
 const selected=Array.from({length:count},(_,i)=>({file_name:file,license_id:'SYNTHETIC-'+String(i+1).padStart(5,'0'),provider_name:'Synthetic center '+i,license_type:'Licensed Provider',provider_program_type:i===count-1?'CBCCPP - Non-Recurring':'CBCCPP',address_1:i===0?null:'123 Synthetic Street',provider_town:'Synthetic Town',zip_code:'05001',county:'Synthetic County',current_license_start_date:'2026-01-01T00:00:00.000',current_license_end_date:'2026-12-31T00:00:00.000',total_licensed_capacity:'25',infant_licensed_capacity:'5',toddler_licensed_capacity:'5',preschool_licensed_capacity:'10',school_age_licensed_capacity:'5'}));
 const calls=[],persisted=[];let selectedSeen=false;
 const fetchImpl=async(url,settings)=>{
  let kind,pageNumber=null,payload;
  if(settings.method==='GET'){
   kind=Object.keys(VT_CHILDCARE_URLS).find(k=>VT_CHILDCARE_URLS[k]===url);if(!kind)throw Error('Unexpected synthetic URL');
   payload=kind==='metadata'?{id:'ctdw-tmfz',name:'Vermont Child Care Provider Data',description:catalogDescription,attribution:'Department for Children and Families (DCF), Child Development Division',owner:{...owner},licenseId:'OPEN_DATABASE_LICENSE',license:{...license},rowsUpdatedAt:1786726136,viewLastModified:1786726133,publicationDate:1786648521,columns:[...VT_CHILDCARE_FIELDS.map(fieldName=>({fieldName,dataTypeName:VT_CHILDCARE_FIELD_TYPES[fieldName],description:descriptions[fieldName],cachedContents:{sample:'PRIVATE_CACHE'}})),{fieldName:'latitude',dataTypeName:'number',description:jitter('Latitudinal')},{fieldName:'longitude',dataTypeName:'number',description:jitter('Longitudinal')}]}:
   kind==='groups'?[
    ...(count>1?[{file_name:file,provider_program_type:'CBCCPP',license_type:'Licensed Provider',source_rows:String(count-1)}]:[]),
    {file_name:file,provider_program_type:'CBCCPP - Non-Recurring',license_type:'Licensed Provider',source_rows:'1'}
   ]:[{source_rows:String(count),distinct_licenses:String(count),reporting_files:'1',license_start_count:String(count),license_end_count:String(count)}];
  }else{
   const body=JSON.parse(settings.body);pageNumber=body.page.pageNumber;kind=body.query.startsWith('SELECT file_name,license_id WHERE')?(selectedSeen?'final-ids':'baseline-ids'):'page';
   if(kind==='page')selectedSeen=true;
   const expected=vtChildcareRequest(kind,pageNumber);if(url!==expected.url||JSON.stringify(body)!==JSON.stringify(expected.request.body)||settings.method!=='POST')throw Error('Unexpected synthetic request');
   payload=structuredClone(selected.slice((pageNumber-1)*500,pageNumber*500));if(kind!=='page')payload=payload.map(({file_name,license_id})=>({file_name,license_id}));
  }
  calls.push({kind,pageNumber,method:settings.method,url,request:settings.body?JSON.parse(settings.body):null});
  const response=await mutate(payload,kind,{pageNumber,calls,persisted,selected});
  return response instanceof Response?response:Response.json(payload);
 };
 const options={fetchImpl,now:()=>new Date('2026-09-08T21:00:00.000Z'),retainPrerequisite:async p=>{persisted.push({kind:'prerequisite',value:p});},retainObservation:async(o,index)=>{persisted.push({kind:o.kind,index,value:o});}};
 return {...options,options,calls,persisted,selected};
}
