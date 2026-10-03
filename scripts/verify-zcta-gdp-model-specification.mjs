#!/usr/bin/env node
import {verifyZctaGdpModelSpecification} from '../runner/zcta-gdp-model-specification.mjs';
const i=process.argv.indexOf('--manifest');if(i<0||!process.argv[i+1])throw Error('--manifest is required');
console.log(JSON.stringify(await verifyZctaGdpModelSpecification(process.argv[i+1]),null,2));
