#!/usr/bin/env node
import {verifyOfflineAcsZctaRelease} from '../runner/acs-zcta-demographic-offline-admission.mjs';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')throw Error('Usage: verify-acs-zcta-demographic-offline-release --manifest <file>');
process.stdout.write(`${JSON.stringify(await verifyOfflineAcsZctaRelease(args[1]),null,2)}\n`);
