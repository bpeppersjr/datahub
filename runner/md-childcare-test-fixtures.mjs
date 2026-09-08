import contract from '../config/connectors/md-childcare-preflight.json' with {type:'json'};
import {MD_CHILDCARE_URLS} from './md-childcare-preflight.mjs';
const C=contract.source_contract;
export function createMdChildcareFixture({count=2,mutate=()=>{},prerequisite,observation}={}){
 const calls=[],persisted=[];let inventories=0;
 const selected=Array.from({length:count},(_,i)=>({attributes:{OBJECTID:i+1,Provider_Type:'Child Care Center',Facility_Name:`Synthetic center ${i}`,DBA_Name:null,License_Number:i<2?'same-credential':`license-${i}`,Street_Address:i===0?null:'123 Synthetic Street',City:'Baltimore',State:'MD',Zip_Code:21201},geometry:i===0?null:{x:-76.6,y:39.3}}));
 const options={now:()=>new Date('2026-09-08T19:00:00.000Z'),retainPrerequisite:async v=>{persisted.push('prerequisite');await prerequisite?.(v);},retainObservation:async v=>{persisted.push(v.kind);await observation?.(v);},fetchImpl:async(url,request)=>{
  const u=new URL(url);let kind,payload;
  if(url===MD_CHILDCARE_URLS.item){kind='item';payload={id:C.item_id,owner:C.owner,orgId:C.organization_id,title:C.title,name:C.item_name,type:C.item_type,access:C.access,url:C.service_url,description:C.description,licenseInfo:C.licenseInfo,created:1745014272000,modified:1779911329000,numViews:1};}
  else if(url===MD_CHILDCARE_URLS.layer){kind='layer';payload={id:0,name:C.layer_name,type:'Feature Layer',description:'',serviceItemId:C.item_id,objectIdField:'OBJECTID',geometryType:'esriGeometryPoint',capabilities:'Query',maxRecordCount:2000,extent:{spatialReference:{wkid:102100,latestWkid:3857}},advancedQueryCapabilities:{supportsPagination:true,supportsStatistics:true,supportsOrderBy:true},editingInfo:{lastEditDate:1779911324252,schemaLastEditDate:1779911324252,dataLastEditDate:1779911324252},fields:structuredClone(C.fields)};}
  else if(url===MD_CHILDCARE_URLS.count){kind='count';payload={count};}
  else if(u.searchParams.get('returnIdsOnly')==='true'){kind=++inventories===1?'baseline-ids':'final-ids';payload={objectIdFieldName:'OBJECTID',objectIds:selected.map(r=>r.attributes.OBJECTID)};}
  else{kind='page';const ids=u.searchParams.get('objectIds').split(',').map(Number);payload={objectIdFieldName:'OBJECTID',uniqueIdField:{name:'OBJECTID',isSystemMaintained:true},globalIdFieldName:'',geometryType:'esriGeometryPoint',spatialReference:{wkid:4326,latestWkid:4326},fields:C.fields.map(f=>({name:f.name,type:f.type,alias:f.name,sqlType:'sqlTypeOther',domain:null,defaultValue:null,...(f.length===undefined?{}:{length:f.length})})),exceededTransferLimit:false,features:structuredClone(selected.filter(r=>ids.includes(r.attributes.OBJECTID)))};}
  calls.push({kind,url,request});const result=await mutate(payload,kind,{calls,persisted,u});return result instanceof Response?result:Response.json(payload);
 }};return {...options,options,calls,persisted,selected};
}
