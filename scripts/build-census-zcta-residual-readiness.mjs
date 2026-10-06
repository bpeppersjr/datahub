import {buildCensusZctaResidualReadiness} from '../runner/census-zcta-residual-readiness-release.mjs';
const createdAt=process.argv[2];try{console.log(JSON.stringify(await buildCensusZctaResidualReadiness({createdAt}),null,2))}catch{console.error('Census residual readiness build failed.');process.exitCode=1}
