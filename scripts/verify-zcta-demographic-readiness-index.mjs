#!/usr/bin/env node
import {verifyZctaDemographicReadinessIndex}from'../runner/zcta-demographic-readiness-index.mjs';
const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};console.log(JSON.stringify(await verifyZctaDemographicReadinessIndex(get('--manifest'),{sourceManifest:get('--source-manifest')}),null,2));
