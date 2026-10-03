#!/usr/bin/env node
import {publishZctaGdpAllocationMethodEvaluation} from '../runner/zcta-gdp-allocation-method-evaluation.mjs';
console.log(JSON.stringify(await publishZctaGdpAllocationMethodEvaluation(),null,2));
