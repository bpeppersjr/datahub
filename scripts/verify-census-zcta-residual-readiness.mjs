import {verifyCensusZctaResidualReadiness} from '../runner/census-zcta-residual-readiness-release.mjs';
try{console.log(JSON.stringify(await verifyCensusZctaResidualReadiness({manifestPath:process.argv[2]}),null,2))}catch{console.error('Census residual readiness verification failed.');process.exitCode=1}
