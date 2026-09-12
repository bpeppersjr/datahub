import {readNonemployerIndustryAlignment,readNonemployerIndustryAlignmentWithTestInput} from './nonemployer-industry-alignment.mjs';

export const NONEMPLOYER_SELECTION_VERSION='nonemployer-industry-selection@1.0.0';
const FIPS='01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split(' ');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const entry=(naics,sourceLabel,level,contextCategoryId,scopeNotice)=>({naics,sourceLabel,level,contextCategoryId,scopeNotice,categoryRelation:'context-only-not-equivalent',classificationUrl:`https://www.census.gov/naics/?input=${encodeURIComponent(naics)}&year=2022&details=${encodeURIComponent(naics)}`});
const CATALOG=freeze({schemaVersion:NONEMPLOYER_SELECTION_VERSION,naicsVersion:'2022',referenceYear:2023,selectionMode:'one-exact-code',entries:[
 entry('44-45','Retail trade','sector','retail-consumer','Broad retail sector; not the SNAP, food-license or alcohol-license cohort.'),
 entry('4451','Grocery and convenience retailers','industry-group','retail-consumer','Includes convenience retailers and vending machine operators; not grocery-only or verified physical stores.'),
 entry('45611','Pharmacies and drug retailers','naics-industry','health-care','Retail pharmacy classification, not all NPPES organizations or verified physical pharmacies.'),
 entry('62441','Child care services','naics-industry','childcare','Nonemployer child care services; not equivalent to licensed center-only state cohorts.'),
 entry('23','Construction','sector','construction','Nonemployer construction establishments; not contractor credential rows or employer establishments.'),
],classificationEvidenceReviewedOn:'2026-09-12',catalogLabels:'Retained 2023 NES national total-cell labels; this catalog is not a live classification lookup.',claims:{automaticCategoryCrosswalk:false,multiCodeAggregation:false,collectionCompletenessPercent:null,employerUniverseIncluded:false}});
export function getNonemployerIndustrySelectionCatalog(){return CATALOG;}
function check(value){if(!value)throw Error('Nonemployer industry selection rejected.');}
export function validateNonemployerIndustrySelection(value){
 check(value&&Object.getPrototypeOf(value)===Object.prototype);const keys=['naicsVersion','referenceYear','naics','states','signal'];
 check(Reflect.ownKeys(value).every(key=>keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));
 check(value.naicsVersion==='2022'&&value.referenceYear===2023&&typeof value.naics==='string'&&CATALOG.entries.some(e=>e.naics===value.naics));check(value.signal===undefined||value.signal instanceof AbortSignal);value.signal?.throwIfAborted();
 const states=value.states??FIPS;check(Array.isArray(states)&&Object.getPrototypeOf(states)===Array.prototype&&states.length<=51&&Reflect.ownKeys(states).length===states.length+1);
 for(let i=0;i<states.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(states,String(i))??{},'value')&&typeof states[i]==='string'&&FIPS.includes(states[i]));check(new Set(states).size===states.length);
 return freeze({schemaVersion:NONEMPLOYER_SELECTION_VERSION,naicsVersion:'2022',referenceYear:2023,naics:value.naics,states:[...states].sort()});
}
function present(selection,alignment){return freeze({schemaVersion:NONEMPLOYER_SELECTION_VERSION,selection,industry:CATALOG.entries.find(e=>e.naics===selection.naics),alignment,claims:{automaticCategoryCrosswalk:false,multiCodeAggregation:false,collectionCompletenessPercent:null,employerUniverseIncluded:false,exportPolicy:'local-review-only'}});}
export async function readSelectedNonemployerIndustry(options){const selection=validateNonemployerIndustrySelection(options);const alignment=await readNonemployerIndustryAlignment({naics:selection.naics,referenceYear:selection.referenceYear,states:selection.states,signal:options.signal});options.signal?.throwIfAborted();return present(selection,alignment);}
// Explicit fixture entry retains the underlying reader's data/tmp restriction and synthetic label.
export async function readSelectedNonemployerIndustryWithTestInput(input,options){const selection=validateNonemployerIndustrySelection(options);const alignment=await readNonemployerIndustryAlignmentWithTestInput(input,{naics:selection.naics,referenceYear:selection.referenceYear,states:selection.states,signal:options.signal});options.signal?.throwIfAborted();return present(selection,alignment);}
