import {publishZctaEconomicModelInputCohort} from '../runner/zcta-economic-model-input-cohort.mjs';
const a=process.argv.slice(2);
if(a.length!==6||a[0]!=='--source-manifest'||a[2]!=='--source-sha256'||a[4]!=='--created-at')throw Error('Usage: --source-manifest <retained manifest> --source-sha256 <exact SHA256> --created-at <ISO UTC>');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
console.log(JSON.stringify(await publishZctaEconomicModelInputCohort({sourceManifest:a[1],sourceManifestSha256:a[3],createdAt:a[5],signal:controller.signal}),null,2));
