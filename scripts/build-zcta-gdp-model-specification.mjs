#!/usr/bin/env node
import {publishZctaGdpModelSpecification} from '../runner/zcta-gdp-model-specification.mjs';
console.log(JSON.stringify(await publishZctaGdpModelSpecification(),null,2));
