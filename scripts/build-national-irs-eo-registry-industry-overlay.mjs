#!/usr/bin/env node
import { buildNationalIrsEoRegistryIndustryOverlay as build } from '../runner/national-irs-eo-registry-industry-overlay.mjs';
console.log(JSON.stringify(await build(), null, 2));
