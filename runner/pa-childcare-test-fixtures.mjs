import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { PA_CHILDCARE_FIELDS, PA_CHILDCARE_DESCRIPTION, PA_CHILDCARE_URLS } from "./pa-childcare-preflight.mjs";

export let paPolicyFixture;
try { paPolicyFixture = (await readFile(path.join(APP_ROOT,"data/tmp/pa-data-policy-fragment.html"),"utf8")).trim(); }
catch(error) { if(error.code !== "ENOENT") throw error; }
export const paFixtureOptions = {skip:!paPolicyFixture && "Ignored policy fixture absent; no network fallback."};
export function paMetadataFixture() {
  return {
    id:"ajn5-kaxt",name:"Child Care Providers including Early Learning Programs Listing Current Monthly Facility County Human Services",
    attribution:"Department of Human Services",license:{name:"Public Domain U.S. Government",termsLink:"https://www.usa.gov/government-works"},
    description:PA_CHILDCARE_DESCRIPTION,rowsUpdatedAt:Date.parse("2026-08-13T14:32:18Z") / 1000,
    columns:PA_CHILDCARE_FIELDS.map(fieldName => ({fieldName,dataTypeName:fieldName === "geocoded_column" ? "point" : ["license_issue_date","license_exp_date"].includes(fieldName) ? "calendar_date" : "text",description:"",cachedContents:{top:["PRIVATE_SAMPLE_NOT_RETAINED"]}})),
  };
}
export function createPaChildcareFixture({count=2,mutate=()=>{},prerequisite,observation}={}) {
  const calls=[],persisted=[];
  let ids=0,metadataCalls=0;
  const selected=Array.from({length:count},(_,index)=>({master_provider_index:`fixture-${String(index).padStart(4,"0")}`,provider_type:"Child Care Center",facility_name:`Synthetic center ${index}`,facility_state:"PA",facility_zip_code:"17101-0123",...(index===0?{}:{license_number:`fixture-license-${index}`,geocoded_column:{type:"Point",coordinates:[-76.88,40.27]}})}));
  const options={
    now:()=>new Date("2026-09-08T12:00:00.000Z"),
    retainPrerequisite:async value=>{persisted.push("prerequisite");await prerequisite?.(value);},
    retainObservation:async value=>{persisted.push(value.kind);await observation?.(value);},
    fetchImpl:async(url,request)=>{
      const u=new URL(url);let kind,value;
      if(url===PA_CHILDCARE_URLS.policy){kind="policy";value=`<div>${paPolicyFixture}</div>`;}
      else if(url===PA_CHILDCARE_URLS.metadata){kind="metadata";value=paMetadataFixture();metadataCalls++;}
      else if(url===PA_CHILDCARE_URLS.aggregate){kind="aggregate";value=[{source_count:String(count),distinct_location_keys:String(count),point_count:String(count-1),license_count:String(count-1)}];}
      else if(u.searchParams.get("$select")==="master_provider_index"){kind=++ids===1?"baseline-ids":"final-ids";value=selected.map(r=>({master_provider_index:r.master_provider_index}));}
      else {kind="page";assert.equal(u.searchParams.get("$select"),PA_CHILDCARE_FIELDS.join(","));value=structuredClone(selected.slice(Number(u.searchParams.get("$offset")),Number(u.searchParams.get("$offset"))+500));}
      calls.push({kind,url,request});
      const result=await mutate(value,kind,{calls,metadataCalls,persisted,u});
      if(result instanceof Response)return result;
      return kind==="policy"?new Response(result??value,{headers:{"content-type":"text/html"}}):Response.json(value);
    },
  };
  return {...options,options,calls,persisted,selected};
}
