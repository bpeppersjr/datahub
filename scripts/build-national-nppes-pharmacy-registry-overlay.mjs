#!/usr/bin/env node
import { buildNationalNppesPharmacyRegistryOverlay as build } from '../runner/national-nppes-pharmacy-registry-overlay.mjs';
console.log(JSON.stringify(await build(), null, 2));
