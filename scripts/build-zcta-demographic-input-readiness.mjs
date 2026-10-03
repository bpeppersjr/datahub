#!/usr/bin/env node
import {publishZctaDemographicInputReadiness} from '../runner/zcta-demographic-input-readiness.mjs';
const args=process.argv.slice(2); const get=(key)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
console.log(JSON.stringify(await publishZctaDemographicInputReadiness({configPath:get('--config')}),null,2));
