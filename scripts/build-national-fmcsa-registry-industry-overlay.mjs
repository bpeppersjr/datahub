#!/usr/bin/env node
import { buildNationalFmcsaRegistryIndustryOverlay as build } from '../runner/national-fmcsa-registry-industry-overlay.mjs';
console.log(JSON.stringify(await build(), null, 2));
