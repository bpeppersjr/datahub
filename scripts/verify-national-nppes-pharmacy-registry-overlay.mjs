#!/usr/bin/env node
import { verifyNationalNppesPharmacyRegistryOverlay as verify } from '../runner/national-nppes-pharmacy-registry-overlay.mjs';
const index = process.argv.indexOf('--manifest');
if (index < 0 || !process.argv[index + 1]) throw new Error('--manifest is required');
console.log(JSON.stringify(await verify(process.argv[index + 1]), null, 2));
