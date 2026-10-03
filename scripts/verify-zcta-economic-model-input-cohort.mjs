import {verifyZctaEconomicModelInputCohort} from '../runner/zcta-economic-model-input-cohort.mjs';
const a=process.argv.slice(2);
if(a.length!==5||a[1]!=='--source-manifest'||a[3]!=='--source-sha256')throw Error('Usage: <cohort manifest> --source-manifest <retained manifest> --source-sha256 <exact SHA256>');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
console.log(JSON.stringify(await verifyZctaEconomicModelInputCohort(a[0],{sourceManifest:a[2],sourceManifestSha256:a[4],signal:controller.signal}),null,2));
