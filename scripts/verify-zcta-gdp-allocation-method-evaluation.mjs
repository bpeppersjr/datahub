#!/usr/bin/env node
import {verifyZctaGdpAllocationMethodEvaluation} from '../runner/zcta-gdp-allocation-method-evaluation.mjs';
const i=process.argv.indexOf('--manifest');if(i<0||!process.argv[i+1])throw Error('--manifest is required');
console.log(JSON.stringify(await verifyZctaGdpAllocationMethodEvaluation(process.argv[i+1]),null,2));
