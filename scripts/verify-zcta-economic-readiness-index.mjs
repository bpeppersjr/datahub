#!/usr/bin/env node
import {verifyZctaEconomicReadinessIndex}from'../runner/zcta-economic-readiness-index.mjs';
const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};console.log(JSON.stringify(await verifyZctaEconomicReadinessIndex(get('--manifest'),{sourceManifest:get('--source-manifest')}),null,2));
