#!/usr/bin/env node
import {publishZctaDemographicReadinessIndex}from'../runner/zcta-demographic-readiness-index.mjs';
const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};console.log(JSON.stringify(await publishZctaDemographicReadinessIndex({sourceManifest:get('--source-manifest'),createdAt:get('--created-at')}),null,2));
