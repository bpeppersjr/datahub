import contract from '../config/co-childcare-source-contract.json' with {type:'json'};
import {CO_CHILDCARE_URLS,CO_CHILDCARE_CATEGORIES} from './co-childcare-preflight.mjs';
import {coChildcareRequest} from './co-childcare-acquisition.mjs';

/** Entirely synthetic selected records; no publisher record samples. */
export function createCoChildcareFixture({count=2,mutate=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||count>20000)throw Error('Synthetic count');
 const selected=Array.from({length:count},(_,i)=>({provider_id:String(9007199254740993n+BigInt(i)),provider_name:'Synthetic center '+i,provider_service_type:'Child Care Center',street_address:'123 Synthetic Street',city:'Synthetic Town',state:'CO',zip:'01234-0067',county:'Synthetic County',total_licensed_capacity:'25'}));
 const calls=[],persisted=[];let selectedSeen=false;
 const fetchImpl=async(url,settings)=>{
  if(settings.method!=='GET'||settings.body!==undefined)throw Error('Unexpected synthetic request');
  let kind=Object.keys(CO_CHILDCARE_URLS).find(k=>CO_CHILDCARE_URLS[k]===url),pageNumber=null,payload;
  if(kind){
   payload=kind==='metadata'?{...structuredClone(contract),rowsUpdatedAt:1788278190,viewLastModified:1788278190,publicationDate:1788278190,metadata:{custom_fields:structuredClone(contract.custom)},columns:Object.entries(contract.fieldTypes).map(([fieldName,dataTypeName])=>({fieldName,dataTypeName,description:contract.descriptions[fieldName]??'',cachedContents:{sample:'PRIVATE_CACHE'}}))}:
    kind==='groups'?CO_CHILDCARE_CATEGORIES.map(provider_service_type=>({provider_service_type,source_rows:String(provider_service_type==='Child Care Center'?count:1)})):
    [{source_rows:String(count),distinct_licenses:String(count),address_count:String(selected.filter(r=>r.street_address!=null).length),zip_count:String(selected.filter(r=>r.zip!=null).length),state_count:String(selected.filter(r=>r.state!=null).length)}];
  }else{
   const u=new URL(url);pageNumber=Number(u.searchParams.get('$offset'))/500+1;kind=u.searchParams.get('$select')==='provider_id'?(selectedSeen?'final-ids':'baseline-ids'):'page';if(kind==='page')selectedSeen=true;
   const expected=coChildcareRequest(kind,pageNumber);if(url!==expected.url)throw Error('Unexpected synthetic URL');
   payload=structuredClone(selected.slice((pageNumber-1)*500,pageNumber*500));if(kind!=='page')payload=payload.map(({provider_id})=>({provider_id}));
  }
  calls.push({kind,pageNumber,method:settings.method,url});const response=await mutate(payload,kind,{pageNumber,calls,persisted,selected});return response instanceof Response?response:Response.json(payload);
 };
 const options={fetchImpl,now:()=>new Date('2026-09-08T22:10:00.000Z'),retainPrerequisite:async value=>{persisted.push({kind:'prerequisite',value});},retainObservation:async(value,index)=>{persisted.push({kind:value.kind,index,value});}};
 return {...options,options,calls,persisted,selected};
}
