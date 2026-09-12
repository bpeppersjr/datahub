import {createHash} from 'node:crypto';
export const ME_ASC_VERSION='me-asc-source-preflight@1.0.0';
export const ME_ASC_ORIGIN='https://gateway.maine.gov';
export const ME_ASC_BASE=ME_ASC_ORIGIN+'/dhhs-apps/aspen/';
export const ME_ASC_LIMITS=Object.freeze({requests:10,response_bytes:1048576,total_bytes:10485760,request_timeout_ms:30000,spacing_ms:250,session_timeout_ms:330000,rows:1000});
export const ME_ASC_COUNTIES=Object.freeze(['ANDROSCOGGIN','AROOSTOOK','CUMBERLAND','HANCOCK','KENNEBEC','PENOBSCOT']);
export const ME_ASC_LABELS=Object.freeze(['Provider','Provider Type','License','Administrator','Phone','Fax','Name','Provider Name','Facility Name','Address','Street','City','Town','State','Zip','Zip Code','County','License Number','License Type','Status','Expiration Date']);
export const meHash=value=>createHash('sha256').update(value).digest('hex');
export const meFail=()=>{throw Error('Maine ASC preflight requires inspection; no automatic retry.');};
export const meCheck=value=>{if(!value)meFail();};
export const meClaims=()=>({collection_ready:false,business_dataset_acquired:false,provider_values_retained:false,contacts_retained:false,raw_html_retained:false,cookies_or_tokens_retained:false,public_export_authorized:false,national_reporting_integrated:false,statewide_completeness_verified:false,physical_sites_verified:false,source_authenticity_independently_verified:false,discarded_response_replayable:false,hashes_are_observation_fingerprints:true});

// Executed in an offline, JavaScript-disabled document. Values returned here are transient only.
export function projectMeDocument(){
 const forms=[...document.forms].map(form=>({name:form.getAttribute('name')??form.id??'',method:(form.getAttribute('method')??'get').toUpperCase(),action:form.getAttribute('action')??'',controls:[...form.elements].map(el=>({tag:el.tagName.toLowerCase(),type:(el.type??'').toLowerCase(),name:el.getAttribute('name')??'',value:el.value??'',disabled:el.disabled===true,checked:el.checked===true}))}));
 const known=['Provider','Provider Type','License','Administrator','Phone','Fax','Name','Provider Name','Facility Name','Address','Street','City','Town','State','Zip','Zip Code','County','License Number','License Type','Status','Expiration Date'];
 const clean=text=>text.replace(/\s+/g,' ').trim().replace(/:$/,'').trim();
 const labelElements=[...document.querySelectorAll('th,label,b,strong,td')].filter(el=>known.includes(clean(el.textContent??''))&&![...el.children].some(child=>clean(child.textContent??'')===clean(el.textContent??'')));
 const labels=labelElements.map(el=>clean(el.textContent??'')),labelCounts={};for(const label of labels)labelCounts[label]=(labelCounts[label]??0)+1;
 const tables=[...document.querySelectorAll('table')].map(table=>{
  const rows=[...table.rows].filter(row=>row.closest('table')===table);
  const cells=rows.map(row=>[...row.cells].map(cell=>({tag:cell.tagName.toLowerCase(),label:known.includes(clean(cell.textContent??''))?clean(cell.textContent??''):null,blank:!(cell.textContent??'').trim()})));
  return {rows:rows.length,widths:cells.map(row=>row.length),header:cells[0]??[],thRows:cells.filter(row=>row.length&&row.every(cell=>cell.tag==='th')).length};
 });
 const links=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(href=>href==='type_pop_services.asp?types=12');
 const tagCounts={};for(const el of document.querySelectorAll('*'))tagCounts[el.tagName]=(tagCounts[el.tagName]??0)+1;
 return {forms,links,labels:[...new Set(labels)].sort(),labelOccurrences:labels.length,labelCounts,tables,tagCounts};
}

export function selectMeForm(document,name,action){
 const found=document.forms.filter(form=>form.name===name);meCheck(found.length===1);const form=found[0];
 meCheck(form.method==='POST'&&new URL(form.action,ME_ASC_BASE).href===ME_ASC_BASE+action&&form.controls.length<=3000);
 return form;
}
export function serializeMeForm(form,{checkboxName,checkboxValues=[],allowNames,requireCsrf=true,submitterName=null}={}){
 const params=new URLSearchParams(),values=new Set(checkboxValues);let csrf=0;
 for(const control of form.controls){
  // HTML's unnamed/disabled and button controls are not successful form fields.
  if(!control.name||control.disabled||['button','reset','image'].includes(control.type))continue;
  if(control.type==='submit'){if(control.name===submitterName){meCheck(allowNames.includes(control.name)&&typeof control.value==='string'&&control.value.length<=4096&&!/[\r\n\u0000]/u.test(control.value));params.append(control.name,control.value);}continue;}
  meCheck(allowNames.includes(control.name)&&typeof control.value==='string'&&control.value.length<=4096&&!/[\r\n\u0000]/u.test(control.value));
  if(control.name==='CSRFToken'){meCheck(control.type==='hidden'&&control.value.length>0);csrf++;}
  if(control.type==='checkbox'){if(control.name===checkboxName){if(values.has(control.value))params.append(control.name,control.value);}else meCheck(!control.checked);}
  else{meCheck(control.type==='hidden');params.append(control.name,control.value);}
 }
 meCheck(csrf===(requireCsrf?1:0));
 if(submitterName)meCheck(form.controls.filter(c=>c.type==='submit'&&c.name===submitterName&&!c.disabled).length===1);
 if(checkboxName){const controls=form.controls.filter(c=>c.name===checkboxName&&!c.disabled);meCheck(controls.every(c=>c.type==='checkbox')&&controls.length===values.size&&new Set(controls.map(c=>c.value)).size===controls.length&&controls.every(c=>values.has(c.value)));}
 return params.toString();
}
export function meSafeDocumentMetadata(document){
 const form_structure=document.forms.map(form=>({known_name:['type_list','facsearch','county_city','facility_list','get_excel'].includes(form.name)?form.name:null,post:form.method==='POST',controls:form.controls.length,unnamed_controls:form.controls.filter(c=>!c.name).length,hidden_controls:form.controls.filter(c=>c.type==='hidden').length,checkbox_controls:form.controls.filter(c=>c.type==='checkbox').length}));
 return {labels:document.labels,label_counts:document.labelCounts,known_label_occurrences:document.labelOccurrences,form_count:document.forms.length,form_structure,table_count:document.tables.length,structure_sha256:meHash(JSON.stringify({tags:document.tagCounts,tables:document.tables.map(table=>({rows:table.rows,widths:table.widths,thRows:table.thRows}))}))};
}
export function meExportMetadata(document){
 const candidates=document.tables.filter(table=>table.rows>=2&&table.header.length>=2&&table.header.every(cell=>cell.tag==='th'||cell.label!==null)&&table.widths.every(width=>width===table.header.length));
 if(candidates.length!==1)return {format:'html-table-unresolved',rows:null,columns:null,known_labels:[],unknown_label_count:null,conservation_verified:false};
 const table=candidates[0],labels=table.header.map(cell=>cell.label);
 return {format:'html-table',rows:table.rows-1,columns:table.header.length,known_labels:labels.filter(Boolean),unknown_label_count:labels.filter(label=>label===null).length,conservation_verified:false};
}
