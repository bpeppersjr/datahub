import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {_electron} from 'playwright';
import electronPath from 'electron';

const root=process.cwd();
await mkdir(path.join(root,'data/tmp'),{recursive:true});
const runtime=await mkdtemp(path.join(root,'data/tmp/workspace-economy-ui-'));
const evidence=path.join(root,'data/ui-verification/workspace-economy');
await mkdir(evidence,{recursive:true});
const app=await _electron.launch({executablePath:electronPath,args:[path.join(root,'desktop/main.mjs')],cwd:root,env:{...process.env,DATAHUB_ROOT:runtime,DATAHUB_DESKTOP_TEST_MODE:'1'}});
try{
 const page=await app.firstWindow();
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.getByRole('tab',{name:'Coverage',exact:true}).waitFor();
 await page.setViewportSize({width:1440,height:1050});
 const rows=[{code:'MN',name:'Minnesota',available:1,measured:2,unmeasured:1,denominator:3,percent:50,measurement_status:'partially-measured',broad_layer_gap:true},{code:'WI',name:'Wisconsin',available:0,measured:0,unmeasured:3,denominator:3,percent:null,measurement_status:'unmeasured',broad_layer_gap:true}];
 const writes=[];
 // Monitor browser API writes during the synthetic interaction flow, not process-wide acquisition.
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push({method:request.method(),path:url.pathname});return route.abort();}
  if(!url.pathname.startsWith('/api/business-map/'))return route.continue();
  if(url.pathname.endsWith('/goal-completion')){const selectedState=url.searchParams.get('state');return route.fulfill({json:{available:true,status:'available',release_id:'synthetic-ui-only',denominator:{version:'synthetic-v1'},categories:['general-business','health-care'],category_summaries:[{category_id:'general-business',national:{available:1,measured:2,unmeasured:1,expected:3},selected_state:selectedState?{code:selectedState,name:'Minnesota',available:1,measured:2,unmeasured:1,expected:3,measurement_status:'partially-measured'}:null},{category_id:'health-care',national:{available:1,measured:2,unmeasured:1,expected:3},selected_state:selectedState?{code:selectedState,name:'Minnesota',available:1,measured:2,unmeasured:1,expected:3,measurement_status:'partially-measured'}:null}],jurisdictions:rows,selected:selectedState?{code:selectedState,category:{datasets:[]}}:null}});}
  if(url.pathname.endsWith('/features'))return route.fulfill({json:{available:true,features:rows.map((row,index)=>({geometry:{type:'Polygon',coordinates:[[[-94+index,44],[-93+index,44],[-93+index,45],[-94+index,44]]]},properties:{geoid:String(index),postal_abbreviation:row.code,name:row.name}}))}});
  if(url.pathname.endsWith('/state-summary'))return route.fulfill({json:{available:true,categories:[{id:'health-care',label:'Health care'}],national_category_counts:{'health-care':10},national_category_percent_of_collected_evidence:{'health-care':20},states:[{postal_abbreviation:'MN',state_name:'Minnesota',category_counts:{'health-care':3},percent_of_category_nationwide:{'health-care':30}}]}});
  if(url.pathname.endsWith('/zip-inspector'))return route.fulfill({json:{zip5:url.searchParams.get('zip'),evidence_status:'positive-source-evidence',governed_zcta:{status:'included',geoid:'00501'},counts:{physical_sites:2,establishments:2,employer_establishments:4},bindings:{coverage_release_id:'synthetic-ui-only'},category_evidence:{category_id:url.searchParams.get('category'),category_label:'Fixture',status:'positive-source-contribution',semantics:'Synthetic source evidence, not GDP.',positive_source_contributions:[{source_id:'fixture-health',source_release_id:'fixture-release',positive_counts:{practice_locations:3}}]}}});
  if(url.pathname.endsWith('/zcta-economic-readiness'))return route.fulfill({json:{schema_version:'zcta-economic-readiness-view@1.0.0',zcta:url.searchParams.get('zcta'),available:true,status:'found',readiness:{population_2020:1200,housing_units_2020:500,zbp_publication_status:'zbp-and-zcta',relationship_count:2,material_relationship_count:1,state_fips:['36'],county_geoids:['36001','36003'],direct_county_gdp_count:2,missing_county_gdp_geoids:[],direct_gdp_relationship_coverage:1,model_status:'withheld',blockers:['no-official-zip-gdp','no-governed-allocation-model']},provenance:{release_id:'readiness-fixture',manifest_sha256:'a'.repeat(64),artifact_sha256:'b'.repeat(64),created_at:'2026-10-02T00:00:00.000Z',geography_release_id:'geography-fixture',input_releases:[{dataset_id:'us-census-geography',release_id:'geography-fixture',manifest_sha256:'c'.repeat(64)}]},limitations:['Synthetic readiness metadata only.'],claims:{official_zip_code:false,active_businesses:false,numeric_gdp_or_demographic_allocation:false}}});
  return route.fulfill({status:503,json:{error:'Synthetic optional view unavailable'}});
 });
 await page.reload();
 await page.getByLabel('Coverage state',{exact:true}).selectOption('MN');
 await page.getByLabel('Coverage category',{exact:true}).selectOption('health-care');
 await page.getByRole('button',{name:'View industry summary',exact:true}).click();
 assert.equal(await page.getByLabel('Coverage state',{exact:true}).inputValue(),'MN');
 assert.equal(await page.getByLabel('Reporting industry',{exact:true}).inputValue(),'health-care');
 await page.getByRole('cell',{name:'30.0%',exact:true}).waitFor();
 await page.screenshot({path:path.join(evidence,'industries-100.png'),fullPage:true});
 await page.getByLabel('Text size',{exact:true}).selectOption('200');
 await page.setViewportSize({width:700,height:900});
 const completionTable=page.getByRole('region',{name:'National and selected-state reporting-industry dataset availability',exact:true});
 await completionTable.focus();
 assert.equal(await completionTable.getAttribute('tabindex'),'0');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'Industries page must not overflow horizontally at 200% text size and narrow viewport');
 assert.equal(await completionTable.evaluate(element=>element.scrollWidth>element.clientWidth),true,'Cross-category table must contain its own horizontal overflow');
 await page.screenshot({path:path.join(evidence,'industries-200-narrow.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1050});
 await page.getByLabel('Text size',{exact:true}).selectOption('100');
 await page.getByRole('button',{name:'Explore ZIP economy',exact:true}).click();
 await page.getByText('Navigation context: MN.',{exact:false}).waitFor();
 await page.getByLabel('Economy ZIP5',{exact:true}).fill('00501');
 await page.getByLabel('Economy business segment',{exact:true}).selectOption('health-care');
 await page.getByRole('button',{name:'View ZIP',exact:true}).click();
 await page.getByRole('heading',{name:'Observed evidence · ZIP 00501',exact:true}).waitFor();
 await page.getByRole('heading',{name:'Economic-model readiness · Census ZCTA 00501',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Business segments',exact:true}).click();
 await page.getByRole('cell',{name:'3 · practice locations',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Business segments',exact:true}).press('End');
 await page.getByRole('heading',{name:'Demographic GDP cross-view',exact:true}).waitFor();
 for(const dimension of ['Race','Lineage / ancestry','Sex','Age']){
  await page.getByLabel('Demographic dimension',{exact:true}).selectOption(dimension);
  await page.getByText(`${dimension}: unavailable in the current ZIP economy contract.`,{exact:true}).waitFor();
 }
 await page.getByLabel('Text size',{exact:true}).selectOption('200');
 assert.equal(await page.getByRole('tab',{name:'Demographics',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'ZIP Economy must not overflow horizontally at 200% text size');
 await page.screenshot({path:path.join(evidence,'demographics-200.png'),fullPage:true});
 await page.getByRole('tab',{name:'Demographics',exact:true}).press('Home');
 await page.getByRole('heading',{name:'Total extrapolated ZIP GDP',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Operations',exact:true}).click();
 await page.getByRole('tab',{name:'Jobs',exact:true}).click();
 await page.getByRole('heading',{name:/Execution queue/}).waitFor();
 assert.deepEqual(writes,[],'Synthetic interaction flow must not issue non-GET browser API requests');
 assert.deepEqual(pageErrors,[],'Browser page errors must fail UI verification');
 console.log(JSON.stringify({passed:true,syntheticEvidence:true,stateAndCategoryPreserved:true,zip:'00501',segment:'health-care',demographicDimensions:4,textScale:200,keyboardTabs:true,browserApiNonGetRequestsDuringSyntheticFlow:writes.length,browserPageErrors:pageErrors.length,screenshots:evidence}));
}catch(error){const page=await app.firstWindow();await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}finally{await app.close();}
