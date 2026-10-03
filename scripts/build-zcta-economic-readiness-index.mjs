#!/usr/bin/env node
import {publishZctaEconomicReadinessIndex}from'../runner/zcta-economic-readiness-index.mjs';
const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};console.log(JSON.stringify(await publishZctaEconomicReadinessIndex({sourceManifest:get('--source-manifest'),createdAt:get('--created-at')}),null,2));
