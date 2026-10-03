#!/usr/bin/env node
import {verifyZctaDemographicInputReadiness} from '../runner/zcta-demographic-input-readiness.mjs';
const args=process.argv.slice(2); const get=(key)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const manifest=get('--manifest'); if(!manifest) throw new Error('--manifest is required');
console.log(JSON.stringify(await verifyZctaDemographicInputReadiness(manifest,{configPath:get('--config')}),null,2));
