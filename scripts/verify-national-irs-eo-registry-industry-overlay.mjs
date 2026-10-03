#!/usr/bin/env node
import { verifyNationalIrsEoRegistryIndustryOverlay as verify } from '../runner/national-irs-eo-registry-industry-overlay.mjs';
const i = process.argv.indexOf('--manifest');
if (i < 0 || !process.argv[i + 1]) throw new Error('--manifest is required');
console.log(JSON.stringify(await verify(process.argv[i + 1]), null, 2));
