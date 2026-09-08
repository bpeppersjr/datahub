import assert from 'node:assert/strict';
import {CT_CHILDCARE_FIELDS,CT_CHILDCARE_FIELD_TYPES,CT_CHILDCARE_URLS} from './ct-childcare-preflight.mjs';
export function ctMetadataFixture(){return {id:'h8mr-dn95',name:'Child Care & Youth Camp Licensing Program Data',description:'Child Care & Youth Camp Licensing Program Data',attribution:'DAS/BEST - eLicensing',license:{name:'Public Domain'},rowsUpdatedAt:Date.parse('2026-09-07T00:00:00Z')/1000,metadata:{custom_fields:{Agency:{Agency:'Office of Early Childhood'},Details:{'Update Frequency':'Daily','Geographic Unit':'Street address'}}},columns:CT_CHILDCARE_FIELDS.map(fieldName=>({fieldName,dataTypeName:CT_CHILDCARE_FIELD_TYPES[fieldName],cachedContents:{top:['PRIVATE_SAMPLE_NOT_RETAINED']}}))};}
export function createCtChildcareFixture({count=2,mutate=()=>{},prerequisite,observation}={}){
  const calls=[],persisted=[];let ids=0,metadataCalls=0;
  const selected=Array.from({length:count},(_,i)=>({uniquekey:`fixture-${String(i).padStart(4,'0')}`,credentialidnt:String(Math.max(1,i)),licensenumber:`license-${Math.max(1,i)}`,name:`Synthetic center ${i}`,licensetype:'Child Care Center',status:'ACTIVE',city:'Hartford',statecode:'CT',zipcode:'06103',...(i===0?{}:{address2:'123 Synthetic Street'})}));
  const options={now:()=>new Date('2026-09-08T12:00:00.000Z'),retainPrerequisite:async v=>{persisted.push('prerequisite');await prerequisite?.(v);},retainObservation:async v=>{persisted.push(v.kind);await observation?.(v);},fetchImpl:async(url,request)=>{
    const u=new URL(url);let kind,value;
    if(url===CT_CHILDCARE_URLS.metadata){kind='metadata';value=ctMetadataFixture();metadataCalls++;}
    else if(url===CT_CHILDCARE_URLS.aggregate){kind='aggregate';value=[{source_count:String(count),distinct_source_keys:String(count),distinct_credentials:String(Math.max(1,count-1)),address_count:String(count-1),zip_count:String(count)}];}
    else if(u.searchParams.get('$select')==='uniquekey'){kind=++ids===1?'baseline-ids':'final-ids';value=selected.map(r=>({uniquekey:r.uniquekey}));}
    else{kind='page';assert.equal(u.searchParams.get('$select'),CT_CHILDCARE_FIELDS.join(','));value=structuredClone(selected.slice(Number(u.searchParams.get('$offset')),Number(u.searchParams.get('$offset'))+500));}
    calls.push({kind,url,request});const result=await mutate(value,kind,{calls,metadataCalls,persisted,u});return result instanceof Response?result:Response.json(value);
  }};return {...options,options,calls,persisted,selected};
}
